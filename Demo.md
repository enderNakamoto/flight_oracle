# Demo

Two ways to run the oracle: unit tests only (no chain), or full flow on a local chain with mocked FlightAware.

---

## Phase 1 — Local test (~30 s)

Parser tests only; no API key or chain.

```bash
cd flight-oracle && npm run demo:phase1
```

**What it does:** Runs Jest against mock AeroAPI responses; asserts OnTime/Delayed/Cancelled and timestamps.

---

## Phase 2 — Local chain, mocked API (~2 min)

Oracle talks to a real contract on Anvil; FlightAware is mocked so no API key is used.

**Prereq:** [Foundry](https://getfoundry.sh) installed (`curl -L https://foundry.paradigm.xyz | bash` then `foundryup`).

1. **Start chain** (separate terminal):
   ```bash
   anvil
   ```

2. **Run the demo script** (from repo root):
   ```bash
   ./scripts/demo-phase2.sh
   ```

**What it does:** Deploys the aggregator, sets Controller + Oracle, registers flight UAL123, runs the oracle (HTTP mocked), then calls `getFlightStatus` — you should see `1` (OnTime) from the mock.

---

## Phase 3 — Deploy aggregator to Hedera Testnet

**Prereq:** Foundry installed; Hedera testnet account with HBAR ([Portal](https://portal.hedera.com/) faucet).

1. **Set env** (repo root `.env`):
   ```bash
   HEDERA_RPC_URL=https://testnet.hashio.io/api
   HEDERA_PRIVATE_KEY=0x<your-hex-key>
   ```

2. **Deploy** (from repo root):
   ```bash
   source .env && ./scripts/deploy-hedera-testnet.sh
   ```

3. **Verify** (optional, can do before wiring): `./scripts/verify-hedera-testnet.sh <address>`
4. **Wire:** Call `setController` and `setOracle` with your Controller/Oracle addresses. See [DEPLOY_HEDERA.md](DEPLOY_HEDERA.md).

**Deployed aggregator (Hedera Testnet):** `0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723`  
Explorer: https://hashscan.io/testnet/contract/0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723
