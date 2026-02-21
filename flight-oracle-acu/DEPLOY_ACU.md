# Acurast TEE Oracle — Local Testing & Deployment Guide

## Project structure

```
flight-oracle-acu/
├── src/
│   ├── index_acu.ts          # entry point — conditionally loads polyfill
│   ├── polyfill_acu.ts       # Node.js shim for _STD_ globals (local only)
│   ├── config_acu.ts         # reads _STD_.env (works in both TEE and local)
│   ├── aggregator_acu.ts     # reads + writes contract via fetch() + _STD_
│   ├── flightaware_acu.ts    # calls FlightAware via httpGET()
│   └── std_shim_acu.d.ts     # TypeScript type declarations for _STD_ globals
├── dist/
│   └── bundle.js             # webpack output — the only file Acurast runs
├── mocks/
│   └── flightaware-response.json  # saved API response for offline testing
├── acurast.json              # Acurast deployment config
├── package_acu.json          # rename to package.json before npm install
├── tsconfig_acu.json
├── webpack_acu.config.js
├── .env.acu.example          # copy to .env.acu for local testing
├── .gitignore
└── DEPLOY_ACU.md             # this file
```

---

## How local simulation works

The key insight is that the bundle runs identically locally and on the TEE.

When `LOCAL_MODE=true`:
- `index_acu.ts` runs `require("./polyfill_acu")` first
- `polyfill_acu.ts` installs Node.js equivalents of `_STD_`, `httpGET`, `print`, `environment` on `globalThis`
- All other files (`config_acu`, `aggregator_acu`, `flightaware_acu`) call `_STD_.env`, `httpGET`, `print` as normal — they are completely unaware of local vs TEE

On a real Acurast processor:
- `LOCAL_MODE` is not set, so the polyfill branch is skipped
- The runtime has already injected real `_STD_`, `httpGET`, `print` before the bundle starts
- Exact same code path executes

---

## Phase 1 — Local setup

### Step 1 — Rename and install

```bash
cd flight-oracle-acu
cp package_acu.json package.json
npm install
```

### Step 2 — Create your local env file

```bash
cp .env.acu.example .env.acu
```

Edit `.env.acu` and fill in:
- `RPC_URL=http://localhost:8545` (Anvil)
- `AGGREGATOR_ADDRESS=` your deployed contract
- `ORACLE_PRIVATE_KEY=` an Anvil test key (this is the address you set via setOracle())
- `FLIGHTAWARE_API_KEY=` your real key

---

## Phase 2 — Test locally against Anvil

### Step 1 — Start Anvil (separate terminal)

```bash
anvil
```

Note the first two private keys printed. Key 0 = owner (deployer), key 2 = oracle wallet.

### Step 2 — Deploy the aggregator and wire it

```bash
# From your Solidity/Foundry project directory
forge create src/FlightDataAggregator.sol:FlightDataAggregator \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Save the deployed address, then wire oracle (key 2 address = 0x3C44...)
cast send <AGGREGATOR_ADDRESS> "setController(address)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

cast send <AGGREGATOR_ADDRESS> "setOracle(address)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

Update `AGGREGATOR_ADDRESS` in your `.env.acu`.

### Step 3 — Register a test flight on local chain

```bash
# Replace with a real flight flying today
cast send <AGGREGATOR_ADDRESS> \
  "registerFlight(string,uint256)" \
  "UAL123" $(date -u +%s | awk '{print int($1/86400)*86400}') \
  --rpc-url http://localhost:8545 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dab88c27f5e1720b3b2b4bc1
# Note: use the CONTROLLER key (key 1 = 0x7099...) since registerFlight is onlyController
```

### Step 4 — Build the bundle

```bash
npm run bundle
```

Output: `dist/bundle.js` — this is the single file Acurast will run.

### Step 5 — Run the bundle locally

```bash
LOCAL_MODE=true node dist/bundle.js
```

You should see:

```
[polyfill] Acurast TEE globals installed for local simulation
[polyfill] Oracle address: 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
[oracle_acu] ===== Run started =====
[oracle_acu] 1 active flight(s) to process
[oracle_acu] Processing UAL123@2024-01-15
[flightaware_acu] Fetching UAL123 for date 2024-01-15
[oracle_acu] UAL123@2024-01-15 → status=1 scheduledArrival=... actualArrival=0
[polyfill] Tx submitted: 0xabc...
[polyfill] Tx confirmed in block 3
[oracle_acu] ===== Run completed in 4.2s =====
```

### Step 6 — Verify on-chain

```bash
cast call <AGGREGATOR_ADDRESS> \
  "getFlightStatus(string,uint256)" \
  "UAL123" $(date -u +%s | awk '{print int($1/86400)*86400}') \
  --rpc-url http://localhost:8545
# Should return 0x01 (OnTime) or 0x02 (Delayed)
```

### Step 7 — Run a second time to verify idempotency

```bash
LOCAL_MODE=true node dist/bundle.js
```

Should complete without reverts — the contract only writes fields once but accepts repeated status updates.

---

## Phase 3 — Deploy to Acurast TEE

### Step 1 — Install the Acurast CLI globally

```bash
npm install -g @acurast/cli
```

Verify:
```bash
acurast --version
```

### Step 2 — Initialise Acurast credentials

```bash
acurast init
```

This generates `.env` with an `ACURAST_MNEMONIC` and prints your Acurast account address.

Important: your `acurast.json` is already written (see project root) so the CLI will skip creating a new one.

### Step 3 — Fund your Acurast account

The CLI will tell you your address. Visit the faucet and paste it:

```
https://faucet.acurast.com?address=<your-address>
```

Wait ~30 seconds for tokens to arrive. Verify:
```bash
acurast deploy
# If balance is 0 it will show the faucet link again
```

### Step 4 — Add your app secrets to .env

The `.env` file (created by `acurast init`) is separate from `.env.acu`. Add your app env vars to it:

```bash
# .env  (Acurast credentials file)
ACURAST_MNEMONIC=your mnemonic here...

# App env vars — these get encrypted on-chain during deployment
RPC_URL=https://testnet.hashio.io/api
AGGREGATOR_ADDRESS=0xYourDeployedAggregatorAddress
FLIGHTAWARE_API_KEY=your_real_key
DELAY_THRESHOLD_MINUTES=15
```

Do NOT add `ORACLE_PRIVATE_KEY` here — the TEE processor holds its own key natively.

Verify `acurast.json` lists all four vars under `includeEnvironmentVariables`:
```json
"includeEnvironmentVariables": [
  "RPC_URL",
  "AGGREGATOR_ADDRESS",
  "FLIGHTAWARE_API_KEY",
  "DELAY_THRESHOLD_MINUTES"
]
```

### Step 5 — Build the final bundle

```bash
npm run bundle
```

Confirm `dist/bundle.js` was updated. This is the file that gets uploaded to IPFS.

### Step 6 — Deploy

```bash
acurast deploy
```

Output:
```
Deploying project "flight-oracle"
The CLI will use address: 5GNimXAQ...
The deployment will be scheduled to start in 5 minutes.
There will be 144 executions (every 10 min for ~24h) at 0.001 cACU each.

❯ Deploying project
  ✔ Submitted to Acurast (ipfs://Qm...)
  ✔ Deployment registered (DeploymentID: 4102)
  ⠇ Waiting for deployment to be matched with processors
  ✔ Matched with processor
  ◼ Waiting for processor acknowledgement
  ✔ Acknowledged
```

Note the DeploymentID — you need it to update env vars later.

### Step 7 — Get the processor's oracle address

Once matched, the processor's Ethereum address is printed by the CLI (or visible in the Acurast Hub). This is the address you must set as `authorizedOracle` on the aggregator:

```bash
cast send <AGGREGATOR_ADDRESS> \
  "setOracle(address)" <PROCESSOR_ETH_ADDRESS> \
  --rpc-url https://testnet.hashio.io/api \
  --private-key <OWNER_PRIVATE_KEY>
```

This is the key step: the TEE's oracle address is deterministic per deployment but unknown until after matching. Wire it before the first execution fires.

### Step 8 — Verify the first execution

Watch the Acurast Hub (https://hub.acurast.com) for your deployment. After the first execution (~5 min after deploy):

```bash
cast call <AGGREGATOR_ADDRESS> \
  "getFlightStatus(string,uint256)" \
  "UAL123" <FLIGHT_DATE_UNIX> \
  --rpc-url https://testnet.hashio.io/api
```

Should return a non-zero status (1, 2, or 3).

---

## Updating env vars between executions

If you need to rotate your FlightAware API key mid-deployment:

```bash
# Edit .env with new key, then:
acurast deployments 4102 -e
```

The new values are re-encrypted on-chain and picked up by the next execution.

---

## Execution schedule in acurast.json explained

```json
"execution": {
  "type": "interval",
  "intervalInMs": 600000,      // every 10 minutes
  "numberOfExecutions": 144,   // 144 * 10min = 24 hours of coverage
  "maxExecutionTimeInMs": 60000 // each run must finish within 60s
}
```

To extend coverage, redeploy with a higher `numberOfExecutions`, or redeploy before it runs out.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `NotOracle()` revert | Processor address not wired | Call `setOracle(processorAddress)` |
| Bundle runs but no tx | `AGGREGATOR_ADDRESS` wrong | Double-check .env address |
| `[polyfill] Missing env var` | LOCAL_MODE run missing .env.acu entry | Check .env.acu file |
| Acurast deploy fails — no balance | Faucet tokens not arrived | Wait 1 min and retry |
| No processors matched | Canary network quiet | Try `"minProcessorReputation": 0` and wait |
| FlightAware 401 | API key wrong in .env | Update and `acurast deployments <id> -e` |
