// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IOracleAggregator
/// @notice Interface that the Controller uses to register flights and poll status.
///         Do not modify — this is the contract boundary between Controller and Aggregator.
interface IOracleAggregator {
    enum FlightStatus { Unknown, OnTime, Delayed, Cancelled }

    /// @notice Called by Controller when a new FlightPool is deployed for a flight
    function registerFlight(string calldata flightId, uint256 flightDate) external;

    /// @notice Called by Controller after a FlightPool fully settles and is cleared
    function deregisterFlight(string calldata flightId, uint256 flightDate) external;

    /// @notice Called every 10 minutes by the HSS loop (via Controller) to check flight status
    function getFlightStatus(string calldata flightId, uint256 flightDate)
        external
        view
        returns (FlightStatus);
}
