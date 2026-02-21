# Deploy FlightDataAggregator to Hedera Testnet

## Prerequisites

- [Foundry](https://getfoundry.sh/) installed (`forge`, `cast`)
- Hedera Testnet account with HBAR (get from [Hedera Portal](https://portal.hedera.com/) faucet)
- ECDSA private key in hex (e.g. from Portal or MetaMask export)

## 1. Set deployer env

From repo root, create or edit `.env`:

```bash
HEDERA_RPC_URL=https://testnet.hashio.io/api
HEDERA_PRIVATE_KEY=0x<your-hex-private-key>
```

Or export in the shell:

```bash
export HEDERA_RPC_URL=https://testnet.hashio.io/api
export HEDERA_PRIVATE_KEY=0x...
```

## 2. Deploy

```bash
source .env   # if using .env
./scripts/deploy-hedera-testnet.sh
```

Copy the printed **Deployed to:** address (e.g. `0x...`). This is your `AGGREGATOR_ADDRESS`.

## 3. Wire Controller and Oracle (one-time)

Using the same deployer key (owner):

```bash
cast send $AGGREGATOR_ADDRESS "setController(address)" <CONTROLLER_EOA_OR_CONTRACT> \
  --rpc-url https://testnet.hashio.io/api --private-key $HEDERA_PRIVATE_KEY

cast send $AGGREGATOR_ADDRESS "setOracle(address)" <ORACLE_EOA_ADDRESS> \
  --rpc-url https://testnet.hashio.io/api --private-key $HEDERA_PRIVATE_KEY
```

Replace `$AGGREGATOR_ADDRESS`, `<CONTROLLER_...>`, and `<ORACLE_EOA_ADDRESS>` with your values.

## 4. Verify on HashScan

So the contract shows as verified on [HashScan Testnet](https://hashscan.io/testnet):

```bash
./scripts/verify-hedera-testnet.sh <AGGREGATOR_ADDRESS>
```

Example:

```bash
./scripts/verify-hedera-testnet.sh 0x047f8c7569b9beecab790902ba29daad143041d7
```

**What to do to verify it worked:**

1. **CLI:** You should see `Contract successfully verified` (or similar) from `forge verify-contract`.
2. **HashScan:** Open `https://hashscan.io/testnet/contract/<YOUR_AGGREGATOR_ADDRESS>`. The contract tab should show a green check or “Verified” and the source/ABI.
3. **Optional:** Call a view function to confirm the contract is live, e.g.:
   ```bash
   cast call $AGGREGATOR_ADDRESS "owner()" --rpc-url https://testnet.hashio.io/api
   ```
   The result should be your deployer address.

If verification fails (e.g. “Bytecode mismatch”), ensure you’re on the same Solidity version and `forge build` is clean, then re-run the verify script.
