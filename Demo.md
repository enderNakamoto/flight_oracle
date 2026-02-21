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
4. **Wire (demo):** Set controller and oracle to the **deployer** (same key as `HEDERA_PRIVATE_KEY`). Derive address with `cast wallet address $HEDERA_PRIVATE_KEY`, then:
   ```bash
   cast send $AGGREGATOR_ADDRESS "setController(address)" <DEPLOYER_ADDRESS> --rpc-url https://testnet.hashio.io/api --private-key $HEDERA_PRIVATE_KEY
   cast send $AGGREGATOR_ADDRESS "setOracle(address)" <DEPLOYER_ADDRESS> --rpc-url https://testnet.hashio.io/api --private-key $HEDERA_PRIVATE_KEY
   ```
   For demo, the contract’s “set once” restriction was **commented out** (not removed) so controller and oracle can be re-set; production builds keep the one-time check.

**Deployed aggregator (Hedera Testnet):** `0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723`  
Explorer: https://hashscan.io/testnet/contract/0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723  
Verified source: https://hashscan.io/testnet/contract/0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723/source

---

### Simplified deployment (testing)

For testing, the aggregator can be built with **controller/oracle and set-once checks commented out** (not removed) in `contracts/FlightDataAggregator.sol`: `onlyController` / `onlyOracle` revert lines and `ControllerAlreadySet` / `OracleAlreadySet` in `setController` / `setOracle`. Deploy the same way as Phase 3; you can then re-set controller and oracle anytime.

**Deploy** (repo root, `HEDERA_PRIVATE_KEY` in `.env`):

```bash
source .env && ./scripts/deploy-hedera-testnet.sh
```

**Simplified aggregator (this deploy):** `0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e`  
Explorer: https://hashscan.io/testnet/contract/0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e  
Verified source: https://hashscan.io/testnet/contract/0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e/source  

Use this address in Phase 4 as `AGGREGATOR_ADDRESS` in `flight-oracle/.env` and in the wire/check commands (replace `0x6942037f92Ae710c827ee1c4166c2e6Fc22E8723` with `0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e` when following Phase 4 steps 2–4).

---

## Phase 4 — Local cron: 2 flights, mocked API, Hedera contract

Update the Hedera Testnet aggregator every 10 minutes with mocked data for 2 flights: **UAL1200** (delayed) and **UAL1201** (on time).

**Prereq:** Simplified aggregator deployed (see above); `flight-oracle/.env` has `RPC_URL`, `AGGREGATOR_ADDRESS=0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e`, `ORACLE_PRIVATE_KEY` (same key as deployer for demo).

1. **Set env:** From repo root: `source .env` (or `export HEDERA_PRIVATE_KEY=0x<your-hex-key>`).

2. **Wire controller & oracle** (deployer = signer for register + oracle):
   ```bash
   source .env
   AGGREGATOR=0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e
   RPC=https://testnet.hashio.io/api
   DEPLOYER=$(cast wallet address $HEDERA_PRIVATE_KEY)

   cast send $AGGREGATOR "setController(address)" $DEPLOYER \
     --rpc-url $RPC --private-key $HEDERA_PRIVATE_KEY
   cast send $AGGREGATOR "setOracle(address)" $DEPLOYER \
     --rpc-url $RPC --private-key $HEDERA_PRIVATE_KEY
   ```

3. **Check controller and oracle** (should match `$DEPLOYER`):
   ```bash
   AGGREGATOR=0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e
   RPC=https://testnet.hashio.io/api
   cast call $AGGREGATOR "authorizedController()" --rpc-url $RPC
   cast call $AGGREGATOR "authorizedOracle()" --rpc-url $RPC
   ```

4. **Register the 2 flights** (UAL1200, UAL1201). Set `AGGREGATOR_ADDRESS=0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e` in `flight-oracle/.env`, then:
   ```bash
   cd flight-oracle
   CONTROLLER_PRIVATE_KEY=$HEDERA_PRIVATE_KEY npx ts-node scripts/registerPhase4Flights.ts
   ```

5. **Start the cron** (pick one):
   - **Loop in process:** `cd flight-oracle && npm run demo:phase4` (runs every 10 min; leave running).
   - **System cron:** `*/10 * * * * cd /path/to/flight-oracle && npx ts-node scripts/cron-phase4.ts`

**Expected on contract (after first run):**

| Flight  | Status  | Note   |
|---------|---------|--------|
| UAL1200 | Delayed | 1 h    |
| UAL1201 | On time | —      |

**Check state on-chain:**

```bash
AGGREGATOR=0xA1bcCE6809d80c87b202Ab113451E8cB1Ec0402e
RPC=https://testnet.hashio.io/api
FLIGHT_DATE=$(node -e "const d=new Date(); d.setUTCHours(0,0,0,0); console.log(Math.floor(d.getTime()/1000))")

cast call $AGGREGATOR "getFlightStatus(string,uint256)" "UAL1200" $FLIGHT_DATE \
  --rpc-url $RPC
```

Returns the stored status: **1** = OnTime, **2** = Delayed, **3** = Cancelled. Use `UAL1200` or `UAL1201` and the same `FLIGHT_DATE` (today midnight UTC) the flights were registered with.
