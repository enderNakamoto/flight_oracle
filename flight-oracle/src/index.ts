import "dotenv/config";
import { ethers }               from "ethers";
import { config }               from "./config";
import { buildAggregatorContract, ActiveFlight } from "./aggregator";
import { fetchFlight, parseFlightUpdate }         from "./flightaware";

// -----------------------------------------------
// Convert a JS string to a right-padded bytes32
// for the cancellationReason parameter
// -----------------------------------------------
function toBytes32(str: string): string {
  return ethers.encodeBytes32String(str.slice(0, 31)); // ethers pads to 32 bytes
}

// -----------------------------------------------
// Process a single flight:
//   1. Fetch data from FlightAware
//   2. Parse into contract-ready fields
//   3. Call updateFlightStatus on the aggregator
// -----------------------------------------------
async function processFlight(
  flight:        ActiveFlight,
  writeContract: ethers.Contract
): Promise<void> {
  const { flightId, flightDate } = flight;
  const label = `${flightId} @ ${new Date(Number(flightDate) * 1000).toISOString().split("T")[0]}`;

  console.log(`[oracle] Processing ${label}`);

  // 1. Fetch from FlightAware
  const raw = await fetchFlight(flightId, flightDate);

  if (!raw) {
    console.warn(`[oracle] Skipping ${label} — no data from FlightAware`);
    return;
  }

  // 2. Parse into contract fields
  const update = parseFlightUpdate(raw, config.delayThresholdMins);

  console.log(`[oracle] ${label} → status=${update.status} scheduledArrival=${update.scheduledArrival} actualArrival=${update.actualArrival}`);

  // 3. Push on-chain
  try {
    const tx = await writeContract.updateFlightStatus(
      flightId,
      flightDate,
      update.status,
      update.scheduledArrival,
      update.actualArrival,
      toBytes32(update.cancellationReason)
    );

    console.log(`[oracle] Tx submitted for ${label}: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`[oracle] Tx confirmed for ${label} in block ${receipt.blockNumber}`);

  } catch (err: unknown) {
    // Distinguish revert reasons from network errors
    if (err instanceof Error) {
      // ethers v6 wraps revert data in err.data or err.reason
      const reason = (err as any).reason ?? (err as any).data ?? err.message;
      console.error(`[oracle] Contract revert for ${label}: ${reason}`);
    } else {
      console.error(`[oracle] Unknown error for ${label}:`, err);
    }
  }
}

// -----------------------------------------------
// Main run — called once per cron invocation
// -----------------------------------------------
async function run(): Promise<void> {
  const startTime = Date.now();
  console.log(`\n[oracle] ===== Run started at ${new Date().toISOString()} =====`);

  const { readContract, writeContract } = buildAggregatorContract();

  // 1. Read active flights from aggregator
  let activeFlights: ActiveFlight[];
  try {
    activeFlights = await readContract.getActiveFlights() as ActiveFlight[];
    console.log(`[oracle] ${activeFlights.length} active flight(s) to process`);
  } catch (err) {
    console.error("[oracle] Failed to read active flights from contract:", err);
    process.exit(1);
  }

  if (activeFlights.length === 0) {
    console.log("[oracle] No active flights — nothing to do");
    return;
  }

  // 2. Process flights sequentially to avoid rate limit issues on FlightAware Personal tier
  //    (10 result sets / minute limit). Sequential also makes logs easier to read.
  for (const flight of activeFlights) {
    await processFlight(flight, writeContract);

    // Small delay between API calls to stay well within rate limits
    await sleep(1500);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[oracle] ===== Run completed in ${elapsed}s =====\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// -----------------------------------------------
// Entry point
// -----------------------------------------------
run().catch((err) => {
  console.error("[oracle] Fatal error:", err);
  process.exit(1);
});
