/**
 * index_acu.ts
 *
 * Main entry point for the Acurast TEE flight oracle.
 *
 * LOCAL_MODE=true  → imports polyfill_acu.ts first which installs Node.js
 *                    equivalents of all _STD_ globals. Rest of code is unchanged.
 *
 * On a real Acurast processor (LOCAL_MODE unset):
 *                    _STD_, httpGET, print already injected by the runtime.
 *                    polyfill never imported.
 *
 * Acurast executes this bundle top-to-bottom — no special entry function needed.
 */

// -----------------------------------------------
// Local simulation bootstrap
// -----------------------------------------------
if (process.env["LOCAL_MODE"] === "true") {
  require("./polyfill_acu");
}

import { getActiveFlights, pushFlightStatus } from "./aggregator_acu";
import { fetchFlight, parseFlightUpdate }      from "./flightaware_acu";
import { config }                              from "./config_acu";

async function run(): Promise<void> {
  const startTime = Date.now();
  print(`\n[oracle_acu] ===== Run started =====`);

  // 1. Read active flights from the aggregator contract
  let activeFlights: Awaited<ReturnType<typeof getActiveFlights>>;
  try {
    activeFlights = await getActiveFlights();
    print(`[oracle_acu] ${activeFlights.length} active flight(s) to process`);
  } catch (err) {
    print(`[oracle_acu] FATAL: could not read active flights — ${String(err)}`);
    process.exit(1);
  }

  if (activeFlights.length === 0) {
    print(`[oracle_acu] No active flights — nothing to do`);
    return;
  }

  // 2. Process each flight sequentially to respect rate limits
  for (const flight of activeFlights) {
    const { flightId, flightDate } = flight;
    const label = `${flightId}@${new Date(Number(flightDate) * 1000).toISOString().split("T")[0]}`;

    print(`[oracle_acu] Processing ${label}`);

    const raw = await fetchFlight(flightId, flightDate);

    if (!raw) {
      print(`[oracle_acu] Skipping ${label} — no data returned`);
      continue;
    }

    const update = parseFlightUpdate(raw, config.delayThresholdMins);
    print(`[oracle_acu] ${label} → status=${update.status} scheduledArrival=${update.scheduledArrival} actualArrival=${update.actualArrival}`);

    try {
      await pushFlightStatus(
        flightId,
        flightDate,
        update.status,
        update.scheduledArrival,
        update.actualArrival,
        update.cancellationReason
      );
    } catch (err) {
      print(`[oracle_acu] Error pushing ${label}: ${String(err)}`);
    }

    await sleep(1500);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  print(`[oracle_acu] ===== Run completed in ${elapsed}s =====\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

run().catch((err) => {
  print(`[oracle_acu] FATAL: ${String(err)}`);
  process.exit(1);
});
