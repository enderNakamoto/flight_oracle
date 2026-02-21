# Demo

## Step 1 — Local test

Run the oracle’s unit tests locally (no API key or chain required).

**Steps:**

```bash
cd flight-oracle
npm install
npm test
```

**What’s going on:** Jest runs tests in `src/flightaware.test.ts` that call `parseFlightUpdate()` with mock FlightAware responses. The mocks in `flight-oracle/mocks/` are shaped like real AeroAPI responses (including samples captured from real API calls). The tests assert that the parser maps each case to the correct on-chain status (OnTime, Delayed, Cancelled) and timestamps.
