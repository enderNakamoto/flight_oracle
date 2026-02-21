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
Verified source: https://hashscan.io/testnet/contract/0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723/source

---

## Phase 4 — Local cron: 10 flights, mocked API, Hedera contract

Update the Hedera Testnet aggregator every 10 minutes with mocked data for 10 flights (UAL1200–UAL1209). One cancelled, five delayed 4 h, four on time.

**Prereq:** Phase 3 done; `setController` and `setOracle` called; `flight-oracle/.env` has `RPC_URL=https://testnet.hashio.io/api`, `AGGREGATOR_ADDRESS=0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723`, `ORACLE_PRIVATE_KEY=<your-oracle-key>`.

1. **One-time — register the 10 flights** (Controller = deployer):  
   `cd flight-oracle && CONTROLLER_PRIVATE_KEY=$HEDERA_PRIVATE_KEY npx ts-node scripts/registerPhase4Flights.ts`  
   (Or set `CONTROLLER_PRIVATE_KEY` in `.env` if different from deployer.)

2. **Start the cron locally** (pick one):
   - **Loop in process:** `cd flight-oracle && npm run demo:phase4` (runs every 10 min; leave running).
   - **System cron:** `*/10 * * * * cd /path/to/flight-oracle && npx ts-node scripts/cron-phase4.ts`

**Expected on contract (after first run):**

| Flight  | Status    | Delay / note |
|---------|-----------|--------------|
| UAL1200 | On time   | —            |
| UAL1201 | On time   | —            |
| UAL1202 | On time   | —            |
| UAL1203 | On time   | —            |
| UAL1204 | Delayed   | 4 h          |
| UAL1205 | Delayed   | 4 h          |
| UAL1206 | Delayed   | 4 h          |
| UAL1207 | Delayed   | 4 h          |
| UAL1208 | Delayed   | 4 h          |
| UAL1209 | Cancelled | —            |

**Check state on-chain** (uses `AGGREGATOR_ADDRESS` from `flight-oracle/.env`):

```bash
cd flight-oracle && source .env 2>/dev/null || true
FLIGHT_DATE=$(node -e "const d=new Date(); d.setUTCHours(0,0,0,0); console.log(Math.floor(d.getTime()/1000))")
cast call $AGGREGATOR_ADDRESS "getFlightStatus(string,uint256)" "UAL1204" $FLIGHT_DATE --rpc-url https://testnet.hashio.io/api
```

The command calls the aggregator’s `getFlightStatus(flightId, flightDate)` and returns the stored status as a number: **1** = OnTime, **2** = Delayed, **3** = Cancelled. Use any of the 10 flight ids (e.g. `UAL1204`) and the same `FLIGHT_DATE` (today midnight UTC) the flights were registered with.
