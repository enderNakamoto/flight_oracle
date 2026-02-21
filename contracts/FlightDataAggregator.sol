// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IOracleAggregator.sol";

/// @title FlightDataAggregator
/// @notice On-chain source of truth for flight statuses in the Hedera flight delay
///         insurance system.
///
/// @dev    Three-party flow:
///           1. Controller  → registerFlight / deregisterFlight / getFlightStatus
///           2. Off-chain oracle → getActiveFlights (poll), then updateFlightStatus (push)
///           3. HSS loop    → triggers Controller every 10 min, which calls getFlightStatus
///
///         Composite storage key: keccak256(abi.encodePacked(flightId, flightDate))
///         Only flights with active insurance pools are retained. On deregisterFlight,
///         all storage for that flight is deleted to keep the contract lean.
///
/// @dev    Deployment order:
///           1. Deploy OracleAggregator              → aggregatorAddress
///           2. Deploy Controller(aggregatorAddress) → controllerAddress
///           3. aggregator.setController(controllerAddress)
///           4. aggregator.setOracle(oracleAddress)
contract FlightDataAggregator is IOracleAggregator {

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    /// @notice Rich internal record for each flight — more detailed than the
    ///         simplified FlightStatus enum the Controller sees.
    struct FlightRecord {
        string       flightId;           // original string flight number e.g. "AA1234"
        uint256      flightDate;         // midnight UTC Unix timestamp, trusted from oracle
        uint256      scheduledArrival;   // Unix timestamp of scheduled arrival (0 until set)
        uint256      actualArrival;      // Unix timestamp of actual landing (0 until landed)
        uint256      delayMinutes;       // derived on-chain when actualArrival is first provided
        FlightStatus status;             // Unknown / OnTime / Delayed / Cancelled
        bytes32      cancellationReason; // short code e.g. "WEATHER", "MECHANICAL"
        // --- on-chain phase timestamps ---
        uint256      registeredAt;       // block.timestamp when Controller called registerFlight
        uint256      lastUpdatedAt;      // block.timestamp of last oracle updateFlightStatus call
    }

    /// @notice Lightweight descriptor returned to the off-chain oracle polling service
    struct ActiveFlight {
        string  flightId;
        uint256 flightDate;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    address public owner;

    /// @notice The Controller contract — only address allowed to call
    ///         registerFlight / deregisterFlight / getFlightStatus
    address public authorizedController;
    bool    public controllerSet;

    /// @notice The off-chain oracle pusher — only address allowed to call updateFlightStatus
    address public authorizedOracle;
    bool    public oracleSet;

    /// @dev composite key => FlightRecord (deleted on deregister to free storage)
    mapping(bytes32 => FlightRecord) private flights;

    /// @dev composite key => index+1 in activeKeys array (0 means not active)
    ///      Storing index+1 lets us use 0 as a sentinel for "not in array"
    mapping(bytes32 => uint256) private activeIndex;

    /// @dev ordered list of composite keys for currently active (registered) flights
    bytes32[] private activeKeys;

    /// @dev composite key => ActiveFlight descriptor (mirrors activeKeys, deleted on deregister)
    mapping(bytes32 => ActiveFlight) private activeFlightInfo;

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotOwner();
    error NotController();
    error NotOracle();
    error ZeroAddress();
    error ControllerAlreadySet();
    error OracleAlreadySet();
    error FlightAlreadyRegistered(string flightId, uint256 flightDate);
    error FlightNotFound(string flightId, uint256 flightDate);
    error FlightNotActive(string flightId, uint256 flightDate);

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ControllerSet(address indexed controller);
    event OracleSet(address indexed oracle);

    event FlightRegistered(
        string  flightId,
        uint256 indexed flightDate,
        uint256 blockTimestamp
    );

    event FlightStatusUpdated(
        string  flightId,
        uint256 indexed flightDate,
        FlightStatus    status,
        uint256         scheduledArrival,
        uint256         actualArrival,
        uint256         delayMinutes,
        uint256         blockTimestamp
    );

    event FlightDeregistered(
        string  flightId,
        uint256 indexed flightDate,
        uint256 blockTimestamp
    );

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyController() {
        // if (msg.sender != authorizedController) revert NotController();  // TESTING: disabled
        _;
    }

    modifier onlyOracle() {
        // if (msg.sender != authorizedOracle) revert NotOracle();  // TESTING: disabled
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor() {
        owner = msg.sender;
    }

    // -------------------------------------------------------------------------
    // Admin — one-time wiring after deployment
    // -------------------------------------------------------------------------

    /// @notice Wire in the Controller contract address. Can only be called once.
    /// @dev    Step 3 in the deployment script, after Controller is deployed.
    /// @dev    TESTING: set-once and onlyController/onlyOracle checks commented out for simplified deployment.
    function setController(address controller) external onlyOwner {
        // if (controllerSet) revert ControllerAlreadySet();  // TESTING: allow re-set
        if (controller == address(0)) revert ZeroAddress();
        authorizedController = controller;
        // controllerSet = true;  // TESTING: allow re-set
        emit ControllerSet(controller);
    }

    /// @notice Wire in the off-chain oracle pusher address. Can only be called once.
    /// @dev    Step 4 in the deployment script, after oracle EOA/contract is known.
    /// @dev    TESTING: set-once commented out for simplified deployment.
    function setOracle(address oracle) external onlyOwner {
        // if (oracleSet) revert OracleAlreadySet();  // TESTING: allow re-set
        if (oracle == address(0)) revert ZeroAddress();
        authorizedOracle = oracle;
        // oracleSet = true;  // TESTING: allow re-set
        emit OracleSet(oracle);
    }

    // -------------------------------------------------------------------------
    // IOracleAggregator — Controller-facing functions
    // -------------------------------------------------------------------------

    /// @inheritdoc IOracleAggregator
    /// @dev Called by Controller when a new FlightPool is deployed.
    ///      Adds the flight to the active registry so the oracle starts tracking it.
    function registerFlight(string calldata flightId, uint256 flightDate)
        external
        override
        onlyController
    {
        bytes32 key = _key(flightId, flightDate);

        if (activeIndex[key] != 0) revert FlightAlreadyRegistered(flightId, flightDate);

        // Initialise the rich flight record
        FlightRecord storage fr = flights[key];
        fr.flightId     = flightId;
        fr.flightDate   = flightDate;
        fr.status       = FlightStatus.Unknown;
        fr.registeredAt = block.timestamp;

        // Add to active registry — swap-and-pop compatible index tracking
        activeKeys.push(key);
        activeIndex[key] = activeKeys.length; // index+1 so 0 stays as "not active" sentinel
        activeFlightInfo[key] = ActiveFlight({ flightId: flightId, flightDate: flightDate });

        emit FlightRegistered(flightId, flightDate, block.timestamp);
    }

    /// @inheritdoc IOracleAggregator
    /// @dev Called by Controller after a FlightPool fully settles and is cleared.
    ///      Deletes all storage for the flight — keeps the contract lean.
    function deregisterFlight(string calldata flightId, uint256 flightDate)
        external
        override
        onlyController
    {
        bytes32 key = _key(flightId, flightDate);

        if (activeIndex[key] == 0) revert FlightNotActive(flightId, flightDate);

        // --- Swap-and-pop from activeKeys for O(1) removal ---
        uint256 idx     = activeIndex[key] - 1;       // 0-based index of this key
        uint256 lastIdx = activeKeys.length - 1;

        if (idx != lastIdx) {
            // Move the last key into the vacated slot
            bytes32 lastKey = activeKeys[lastIdx];
            activeKeys[idx] = lastKey;
            activeIndex[lastKey] = idx + 1;           // update moved key's stored index
        }

        activeKeys.pop();

        // Delete all storage associated with this flight
        delete activeIndex[key];
        delete activeFlightInfo[key];
        delete flights[key];                           // frees storage slots, gas refund

        emit FlightDeregistered(flightId, flightDate, block.timestamp);
    }

    /// @inheritdoc IOracleAggregator
    /// @dev Called every 10 minutes by the HSS loop via Controller.
    ///      Returns the simplified FlightStatus the Controller needs for settlement logic.
    ///      Reverts if the flight is not currently registered.
    function getFlightStatus(string calldata flightId, uint256 flightDate)
        external
        view
        override
        returns (FlightStatus)
    {
        bytes32 key = _key(flightId, flightDate);
        if (activeIndex[key] == 0) revert FlightNotFound(flightId, flightDate);
        return flights[key].status;
    }

    // -------------------------------------------------------------------------
    // Oracle-facing functions
    // -------------------------------------------------------------------------

    /// @notice Returns all flights the oracle should query from the external API.
    ///         Only includes flights with an active insurance pool.
    /// @dev    Called by the off-chain polling service before each external API batch call.
    ///         Returns an empty array if no flights are currently registered.
    function getActiveFlights() external view returns (ActiveFlight[] memory) {
        uint256 len = activeKeys.length;
        ActiveFlight[] memory result = new ActiveFlight[](len);
        for (uint256 i = 0; i < len; i++) {
            result[i] = activeFlightInfo[activeKeys[i]];
        }
        return result;
    }

    /// @notice Push updated flight data from the external API into the contract.
    /// @dev    Called by the authorized oracle after querying the external flight API.
    ///         - scheduledArrival is only written the first time (0 = "no update")
    ///         - actualArrival is only written the first time (0 = "not yet landed")
    ///         - delayMinutes is derived on-chain when actualArrival is first provided
    ///         - cancellationReason is only stored when status == Cancelled
    /// @param flightId           flight number string e.g. "AA1234"
    /// @param flightDate         midnight UTC Unix timestamp for the operating date
    /// @param status             new status from oracle: Unknown/OnTime/Delayed/Cancelled
    /// @param scheduledArrival   Unix timestamp of scheduled arrival (0 if unchanged/unknown)
    /// @param actualArrival      Unix timestamp of actual landing (0 if not yet landed)
    /// @param cancellationReason short reason code e.g. bytes32("WEATHER") — ignored if not Cancelled
    function updateFlightStatus(
        string calldata flightId,
        uint256 flightDate,
        FlightStatus status,
        uint256 scheduledArrival,
        uint256 actualArrival,
        bytes32 cancellationReason
    ) external onlyOracle {
        bytes32 key = _key(flightId, flightDate);

        if (activeIndex[key] == 0) revert FlightNotActive(flightId, flightDate);

        FlightRecord storage fr = flights[key];

        // Write scheduledArrival only on first provision
        if (scheduledArrival != 0 && fr.scheduledArrival == 0) {
            fr.scheduledArrival = scheduledArrival;
        }

        // Write actualArrival and derive delayMinutes only on first provision
        if (actualArrival != 0 && fr.actualArrival == 0) {
            fr.actualArrival = actualArrival;
            if (fr.scheduledArrival != 0 && actualArrival > fr.scheduledArrival) {
                fr.delayMinutes = (actualArrival - fr.scheduledArrival) / 60;
            }
            // If actualArrival <= scheduledArrival, delayMinutes stays 0 (on time or early)
        }

        // Store cancellation reason only when relevant
        if (status == FlightStatus.Cancelled) {
            fr.cancellationReason = cancellationReason;
        }

        fr.status        = status;
        fr.lastUpdatedAt = block.timestamp;

        emit FlightStatusUpdated(
            flightId,
            flightDate,
            status,
            fr.scheduledArrival,
            fr.actualArrival,
            fr.delayMinutes,
            block.timestamp
        );
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /// @dev Derives the composite storage key from flightId string + flightDate.
    ///      Using abi.encodePacked is safe here since flightDate is a fixed-size uint256,
    ///      which eliminates hash collision risk from variable-length string packing.
    function _key(string calldata flightId, uint256 flightDate) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(flightId, flightDate));
    }
}
