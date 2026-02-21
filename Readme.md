# Flight Insurance Oracle

Off-chain oracle service for a Hedera-based flight delay insurance protocol. Reads active flights from an on-chain aggregator contract, fetches real-time status from the FlightAware AeroAPI, and pushes updates back on-chain every 10 minutes.

Two deployment targets are provided — a standard Node.js cron job for Render, and a Trusted Execution Environment (TEE) build for Acurast. Both run identical oracle logic; the difference is only in how they sign transactions and how secrets are managed.

---

## How it works

```
FlightAware AeroAPI
        │
        │  httpGET / fetch (every 10 min)
        ▼
  Oracle Service  ──── reads active flights ────▶  FlightDataAggregator
  (this repo)     ◀─── pushes status updates ────  (on-chain contract)
                                                          ▲
                                              Controller reads every 10 min
                                              to settle insurance pools
```

1. The oracle calls `getActiveFlights()` on the aggregator contract — this returns only the flights that currently have an active insurance pool behind them.
2. For each flight, it calls the FlightAware AeroAPI with the flight number and operating date.
3. It maps the API response to one of four statuses — `Unknown`, `OnTime`, `Delayed`, `Cancelled` — and calls `updateFlightStatus()` on the contract.
4. The contract derives `delayMinutes` on-chain from the arrival timestamps; the oracle just passes the raw data.

The oracle never holds or makes decisions about insurance payouts. That logic lives entirely in the Controller contract.

---

## Project structure

```
flight-insurance-oracle/
│
├── contracts/                          # Reference copies — will move to a separate repo
│   ├── IOracleAggregator.sol           # Interface the oracle implements against
│   ├── FlightDataAggregator.sol        # Aggregator contract
│   └── FlightDataAggregator_Architecture.md
│
├── flight-oracle/                      # Render cron job (standard Node.js + TypeScript)
│   ├── src/
│   │   ├── index.ts                    # Main entry — orchestrates each run
│   │   ├── config.ts                   # Env var validation
│   │   ├── aggregator.ts               # Contract ABI + ethers client
│   │   └── flightaware.ts             # FlightAware API fetch + response parser
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── DEPLOY.md                       # Step-by-step Render deployment guide
│
└── flight-oracle-acu/                  # Acurast TEE build (webpack bundle)
    ├── src/
    │   ├── index_acu.ts                # Entry — conditionally loads polyfill
    │   ├── polyfill_acu.ts             # _STD_ shim for local simulation
    │   ├── config_acu.ts               # Reads _STD_.env (works in TEE and locally)
    │   ├── aggregator_acu.ts           # fetch() for reads, _STD_ for writes
    │   ├── flightaware_acu.ts          # Uses httpGET() instead of axios
    │   └── std_shim_acu.d.ts           # TypeScript types for Acurast globals
    ├── dist/                           # webpack output — the only file Acurast runs
    ├── mocks/                          # Saved API responses for offline testing
    ├── acurast.json                    # Acurast deployment config
    ├── package_acu.json                # Rename to package.json before npm install
    ├── webpack_acu.config.js
    ├── .env.acu.example
    └── DEPLOY_ACU.md                   # Step-by-step Acurast deployment guide
```

> **Note on contracts/:** These files are included for reference while the oracle is being developed alongside the contracts. They will be removed from this repo once contracts move to their own repository. The oracle depends only on the `IOracleAggregator` interface — specifically `getActiveFlights()` and `updateFlightStatus()`, which are not part of that interface but are called directly on the aggregator address.

---

## Prerequisites

- Node.js v20+
- A deployed `FlightDataAggregator` contract with your oracle address authorised via `setOracle()`
- A [FlightAware AeroAPI](https://www.flightaware.com/aeroapi/portal) key (Personal tier works for development)
- For Render: a Render account and an EOA wallet funded for gas
- For Acurast: the [Acurast CLI](https://github.com/Acurast/acurast-cli) and cACU tokens from the faucet

---

## Environment variables

Both versions share the same four required variables. The Render version adds one more for the signing wallet.

| Variable | Required by | Description |
|----------|------------|-------------|
| `RPC_URL` | Both | JSON-RPC endpoint for the chain the aggregator is deployed on |
| `AGGREGATOR_ADDRESS` | Both | Deployed `FlightDataAggregator` contract address |
| `FLIGHTAWARE_API_KEY` | Both | FlightAware AeroAPI key |
| `DELAY_THRESHOLD_MINUTES` | Both | Minutes of delay before a flight is marked `Delayed` (default: `15`) |
| `ORACLE_PRIVATE_KEY` | Render only | Signing wallet private key — the address must match `authorizedOracle` on the contract |

On Acurast, `ORACLE_PRIVATE_KEY` is never needed. The TEE processor holds its own hardware-bound key and signs transactions natively via `_STD_.chains.ethereum.fulfill()`.

---

## Quick start — Render

```bash
cd flight-oracle
cp .env.example .env
# fill in .env values
npm install
npm run build
npm start
```

See `flight-oracle/DEPLOY.md` for full Render cron job setup.

---

## Quick start — Acurast (local simulation)

```bash
cd flight-oracle-acu
cp package_acu.json package.json
npm install
cp .env.acu.example .env.acu
# fill in .env.acu values including ORACLE_PRIVATE_KEY for local signing
npm run bundle
LOCAL_MODE=true node dist/bundle.js
```

`LOCAL_MODE=true` activates `polyfill_acu.ts`, which installs Node.js equivalents of all Acurast TEE globals (`_STD_`, `httpGET`, `print`) before the bundle runs. The exact same `dist/bundle.js` that runs locally is deployed to the TEE — no separate builds.

See `flight-oracle-acu/DEPLOY_ACU.md` for full Acurast deployment steps including how to wire the processor's oracle address into the contract after matching.

---

## Flight status mapping

| FlightAware data | Contract status |
|-----------------|----------------|
| `cancelled: true` | `Cancelled` (3) |
| `arrival_delay > threshold` | `Delayed` (2) |
| `arrival_delay <= threshold` | `OnTime` (1) |
| No data yet | `Unknown` (0) — oracle skips pushing |

`delayMinutes` is derived on-chain by the contract, not passed by the oracle. The oracle passes raw `scheduledArrival` and `actualArrival` timestamps; the contract computes the difference. Arrival times prefer gate times (`actual_in`) but fall back to runway times (`actual_on`), which are more reliably populated by the FlightAware API.

---

## Choosing between Render and Acurast

| | Render | Acurast TEE |
|---|--------|------------|
| **Trust model** | You trust Render and the oracle wallet holder | Hardware-attested execution; no single party controls the key |
| **Setup complexity** | Low — standard cron job | Medium — CLI deploy + processor address wiring |
| **Cost** | ~$1/month (Starter tier) | cACU tokens per execution |
| **Key management** | You hold `ORACLE_PRIVATE_KEY` | TEE holds the key; you never see it |
| **Good for** | Development, testnets, cost-sensitive setups | Production, trustless environments |

For testnet development, start with Render. For mainnet production where trust minimisation matters, use Acurast.