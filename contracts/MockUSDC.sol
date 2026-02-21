// SPDX-License-Identifier: MIT
pragma solidity ^0.8.31;

import "@hashgraph/smart-contracts/contracts/system-contracts/hedera-token-service/HederaTokenService.sol";
import "@hashgraph/smart-contracts/contracts/system-contracts/hedera-token-service/IHederaTokenService.sol";
import "@hashgraph/smart-contracts/contracts/system-contracts/HederaResponseCodes.sol";
import "@hashgraph/smart-contracts/contracts/system-contracts/hedera-token-service/ExpiryHelper.sol";
import "@hashgraph/smart-contracts/contracts/system-contracts/hedera-token-service/KeyHelper.sol";

/**
 * @title MockUSDC
 * @notice Creates a real HTS-native fungible token that mimics USDC for testnet development.
 *
 *         This contract is a FACTORY + MINT CONTROLLER, NOT the token itself.
 *         On construction it calls the HTS precompile (0x167) to create an actual
 *         native Hedera token, with this contract as treasury and supply key holder.
 *         The resulting HTS token has its own EVM address exposed via tokenAddress().
 *
 *         IMPORTANT — what address to pass to other contracts:
 *           Use mockUsdc.tokenAddress(), NOT address(mockUsdc).
 *           RiskVault, FlightPool, and Controller all take the HTS token address.
 *           The HTS token is ERC-20 compatible at that address, so all IERC20 calls
 *           (transfer, transferFrom, balanceOf, approve) work normally.
 *
 *         Token properties:
 *           Name:     "Mock USD Coin"
 *           Symbol:   "USDC"
 *           Decimals: 6  (matching real USDC)
 *           Supply:   Infinite (mint on demand for tests)
 *           Treasury: address(this) — this contract holds all minted supply
 *
 *         NOT for production use.
 */
contract MockUSDC is ExpiryHelper, KeyHelper, HederaTokenService {

    // ─────────────────────────────────────────────
    // State
    // ─────────────────────────────────────────────

    address public owner;

    // The EVM address of the HTS token created in the constructor.
    // This is what callers should pass to RiskVault / FlightPool / Controller.
    address public tokenAddress;

    // ─────────────────────────────────────────────
    // Events
    // ─────────────────────────────────────────────

    event TokenCreated(address indexed tokenAddress);
    event Minted(address indexed to, int64 amount);

    // ─────────────────────────────────────────────
    // Constructor
    // ─────────────────────────────────────────────

    /**
     * @notice Deploys MockUSDC and immediately creates the HTS fungible token.
     *         Must be called with enough HBAR to cover HTS token creation fees
     *         (typically ~20 HBAR on testnet — send via constructor value).
     */
    constructor() payable {
        owner = msg.sender;

        // ── Set this contract as the supply key ──────────────────────────
        IHederaTokenService.TokenKey[] memory keys = new IHederaTokenService.TokenKey[](1);
        keys[0] = getSingleKey(
            KeyType.SUPPLY,
            KeyValueType.CONTRACT_ID,
            address(this)
        );

        // ── Token configuration ──────────────────────────────────────────
        IHederaTokenService.HederaToken memory token;
        token.name        = "Mock USD Coin";
        token.symbol      = "USDC";
        token.treasury    = address(this); // this contract holds all supply
        token.tokenKeys   = keys;
        token.freezeDefault = false;

        // Auto-renew: this contract pays renewal fees, 90-day period
        token.expiry = createAutoRenewExpiry(address(this), 7_776_000);

        // ── Create the HTS fungible token ────────────────────────────────
        (int256 responseCode, address createdToken) = HederaTokenService.createFungibleToken(
            token,
            0,    // initial supply — start at zero, mint on demand
            6     // decimals — matching real USDC
        );

        require(
            responseCode == int256(int32(HederaResponseCodes.SUCCESS)),
            "MockUSDC: HTS token creation failed"
        );

        tokenAddress = createdToken;
        emit TokenCreated(createdToken);
    }

    // ─────────────────────────────────────────────
    // Mint (test only)
    // ─────────────────────────────────────────────

    /**
     * @notice Mint new USDC supply and transfer it to a recipient.
     *         Owner only — use this to fund test wallets.
     *
     * @param to     Recipient address (must already be associated with the token)
     * @param amount Amount in smallest units (1 USDC = 1_000_000)
     *
     * @dev  Two-step process required by HTS:
     *       1. mintToken()     — mints to the treasury (this contract)
     *       2. transferToken() — moves from treasury to recipient
     */
    function mint(address to, int64 amount) external {
        // TESTING: access control commented out
        // require(msg.sender == owner, "MockUSDC: not owner");
        require(to != address(0),   "MockUSDC: mint to zero address");
        require(amount > 0,         "MockUSDC: amount must be > 0");

        // Step 1: Mint into treasury (this contract)
        bytes[] memory metadata = new bytes[](0);
        (int256 mintResponse, , ) = HederaTokenService.mintToken(
            tokenAddress,
            amount,
            metadata
        );
        require(
            mintResponse == int256(int32(HederaResponseCodes.SUCCESS)),
            "MockUSDC: mint failed"
        );

        // Step 2: Transfer from treasury to recipient
        int256 transferResponse = HederaTokenService.transferToken(
            tokenAddress,
            address(this), // from treasury
            to,
            amount
        );
        require(
            transferResponse == int256(int32(HederaResponseCodes.SUCCESS)),
            "MockUSDC: transfer from treasury failed"
        );

        emit Minted(to, amount);
    }
}
