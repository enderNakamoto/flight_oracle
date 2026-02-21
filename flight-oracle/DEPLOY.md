# Deploying the Flight Oracle to Render as a Cron Job

## What this does

Render runs `npm start` (which calls `node dist/index.js`) on a schedule every 10 minutes.
Each execution reads active flights from the aggregator contract, fetches live data from
FlightAware, and pushes updates back on-chain. The process exits cleanly after each run.

---

## Prerequisites

- A [Render account](https://render.com)
- This repo pushed to GitHub or GitLab
- Your aggregator contract deployed and the oracle wallet address set via `setOracle()`
- A FlightAware AeroAPI key

---

## Step 1 — Prepare the repo

Make sure your repo contains these files at the root:

```
package.json       ← must have "build": "tsc" and "start": "node dist/index.js"
tsconfig.json
src/
  index.ts
  config.ts
  aggregator.ts
  flightaware.ts
.gitignore         ← must include dist/ and .env
```

**Do not commit `.env` or `dist/` to git.** Render builds from source and injects env vars separately.

---

## Step 2 — Push to GitHub

```bash
git init
git add .
git commit -m "initial flight oracle"
git remote add origin https://github.com/YOUR_USERNAME/flight-oracle.git
git push -u origin main
```

---

## Step 3 — Create a Cron Job on Render

1. Go to [dashboard.render.com](https://dashboard.render.com)
2. Click **"New +"** → **"Cron Job"**
3. Connect your GitHub account and select the `flight-oracle` repository
4. Fill in the settings:

| Setting | Value |
|---------|-------|
| **Name** | `flight-oracle` |
| **Region** | Oregon (US West) or Frankfurt — pick closest to your RPC |
| **Branch** | `main` |
| **Runtime** | `Node` |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Schedule** | `*/10 * * * *` |
| **Instance Type** | `Starter` ($1/month, sufficient) |

The schedule `*/10 * * * *` means: every 10 minutes, on the 0th, 10th, 20th, 30th, 40th, 50th minute of every hour.

---

## Step 4 — Set environment variables

In the Render dashboard, go to your cron job → **"Environment"** tab → **"Add Environment Variable"** for each:

| Key | Value |
|-----|-------|
| `RPC_URL` | `https://testnet.hashio.io/api` (or your RPC) |
| `AGGREGATOR_ADDRESS` | `0xYourDeployedAggregatorAddress` |
| `ORACLE_PRIVATE_KEY` | `0xYourOracleWalletPrivateKey` |
| `FLIGHTAWARE_API_KEY` | `your_flightaware_key` |
| `DELAY_THRESHOLD_MINUTES` | `15` |

> **Security note:** Render encrypts env vars at rest and never exposes them in logs or build output. Never put `ORACLE_PRIVATE_KEY` in your repo or `.env` file that gets committed.

---

## Step 5 — Deploy

Click **"Create Cron Job"**. Render will:
1. Clone your repo
2. Run `npm install && npm run build` (compiles TypeScript → `dist/`)
3. Wait for the next 10-minute mark on the clock
4. Run `npm start` → your oracle executes → process exits
5. Repeat every 10 minutes

---

## Step 6 — Verify it's working

**Check logs in Render dashboard:**

Go to your cron job → **"Logs"** tab. You should see output like:

```
[oracle] ===== Run started at 2024-01-15T10:00:00.000Z =====
[oracle] 3 active flight(s) to process
[oracle] Processing UAL123 @ 2024-01-15
[oracle] UAL123 @ 2024-01-15 → status=1 scheduledArrival=1705322400 actualArrival=0
[oracle] Tx submitted for UAL123 @ 2024-01-15: 0xabc123...
[oracle] Tx confirmed for UAL123 @ 2024-01-15 in block 45231
[oracle] ===== Run completed in 8.3s =====
```

**Check the contract directly:**

Use `cast call` (Foundry) to verify a status was written:

```bash
cast call $AGGREGATOR_ADDRESS \
  "getFlightStatus(string,uint256)" \
  "UAL123" \
  1705276800 \
  --rpc-url $RPC_URL
```

---

## Timing alignment with the Controller's HSS loop

The Controller's HSS loop also runs every 10 minutes. To ensure the oracle has fresh data
ready before the Controller reads it, consider offsetting the cron schedule by 2–3 minutes.
For example, if the HSS loop fires at :00/:10/:20, set the oracle to fire at :02/:12/:22:

```
2-59/10 * * * *
```

This gives the oracle ~8 minutes to fetch and push before the Controller polls.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| `Missing required environment variable` | Env var not set in Render | Check Environment tab |
| `NotOracle()` contract revert | Oracle wallet not authorized | Call `setOracle(walletAddress)` from owner |
| `FlightNotActive` revert | Flight deregistered between read and write | Normal race condition — safe to ignore |
| `429` from FlightAware | Rate limit exceeded | Reduce flights per run or upgrade FlightAware tier |
| Build fails with TS errors | TypeScript version mismatch | Pin `typescript` version in `package.json` |
| No logs appearing | Cron job paused or build failed | Check "Events" tab in Render dashboard |
