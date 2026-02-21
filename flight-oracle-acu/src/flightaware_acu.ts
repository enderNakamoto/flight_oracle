/**
 * flightaware_acu.ts
 *
 * FlightAware AeroAPI client for the Acurast TEE.
 *
 * Uses httpGET() — the Acurast injected global — instead of axios.
 * In local simulation mode polyfill_acu.ts provides an httpGET polyfill
 * backed by Node.js https.request with the same callback signature.
 *
 * The TLS certificate returned in the success callback is available for
 * on-chain attestation in a real TEE — we log it here for observability.
 */

import { config } from "./config_acu";

const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";

// -----------------------------------------------
// Types — only fields we actually use
// -----------------------------------------------
export interface AeroApiFlight {
  ident:            string;
  fa_flight_id:     string;
  cancelled:        boolean;
  diverted:         boolean;
  status:           string;
  departure_delay:  number | null;
  arrival_delay:    number | null;
  progress_percent: number | null;
  scheduled_in:     string | null;  // scheduled gate arrival (ISO 8601 UTC)
  actual_in:        string | null;  // actual gate arrival   (often null — use actual_on as fallback)
  scheduled_on:     string | null;  // scheduled wheels-on   (runway)
  actual_on:        string | null;  // actual wheels-on      (more reliable than gate)
}

interface AeroApiResponse {
  flights:   AeroApiFlight[];
  num_pages: number;
}

// -----------------------------------------------
// Fetch a single flight on a specific UTC date.
// Returns the most progressed matching flight, or null if not found.
// -----------------------------------------------
export function fetchFlight(
  flightId:   string,
  flightDate: bigint
): Promise<AeroApiFlight | null> {
  return new Promise((resolve) => {

    const startDate = new Date(Number(flightDate) * 1000);
    const endDate   = new Date(Number(flightDate) * 1000 + 86_400_000);
    const startIso  = startDate.toISOString().split("T")[0]!;
    const endIso    = endDate.toISOString().split("T")[0]!;

    const url = `${AEROAPI_BASE}/flights/${encodeURIComponent(flightId)}?start=${startIso}&end=${endIso}&max_pages=1`;

    print(`[flightaware_acu] Fetching ${flightId} for date ${startIso}`);

    httpGET(
      url,
      {
        "x-apikey": config.flightAwareApiKey,
        "Accept":   "application/json",
      },
      (payload: string, certificate: string) => {
        // Log TLS cert fingerprint — in a real TEE this can be used for on-chain attestation
        if (certificate) {
          print(`[flightaware_acu] TLS cert hash: ${certificate.slice(0, 16)}...`);
        }

        let data: AeroApiResponse;
        try {
          data = JSON.parse(payload) as AeroApiResponse;
        } catch {
          print(`[flightaware_acu] JSON parse error for ${flightId}`);
          resolve(null);
          return;
        }

        if (!data.flights || data.flights.length === 0) {
          print(`[flightaware_acu] No flights found for ${flightId} on ${startIso}`);
          resolve(null);
          return;
        }

        // Pick the most progressed leg (handles diverted flights with two legs)
        const sorted = [...data.flights].sort(
          (a, b) => (b.progress_percent ?? 0) - (a.progress_percent ?? 0)
        );

        resolve(sorted[0] ?? null);
      },
      (error: string) => {
        print(`[flightaware_acu] httpGET error for ${flightId}: ${error}`);
        resolve(null); // resolve null so the run continues with remaining flights
      }
    );
  });
}

// -----------------------------------------------
// Parse AeroAPI response into contract-ready fields
// -----------------------------------------------
export interface ParsedFlightUpdate {
  status:             number;   // FlightStatus enum value (0-3)
  scheduledArrival:   bigint;
  actualArrival:      bigint;
  cancellationReason: string;
}

export function parseFlightUpdate(
  flight:             AeroApiFlight,
  delayThresholdMins: number
): ParsedFlightUpdate {

  // Prefer gate times; fall back to runway times (more reliably populated by AeroAPI)
  const scheduledArrival = isoToUnix(flight.scheduled_in ?? flight.scheduled_on);
  const actualArrival    = isoToUnix(flight.actual_in    ?? flight.actual_on);

  if (flight.cancelled) {
    return {
      status:             3, // Cancelled
      scheduledArrival,
      actualArrival:      0n,
      cancellationReason: deriveCancellationReason(flight.status),
    };
  }

  const delaySeconds = flight.arrival_delay ?? flight.departure_delay ?? 0;
  const isDelayed    = delaySeconds > delayThresholdMins * 60;

  return {
    status:             isDelayed ? 2 : 1, // Delayed : OnTime
    scheduledArrival,
    // Only pass actualArrival when flight has fully completed
    actualArrival:      flight.progress_percent === 100 ? actualArrival : 0n,
    cancellationReason: "",
  };
}

// -----------------------------------------------
// Helpers
// -----------------------------------------------

function isoToUnix(iso: string | null | undefined): bigint {
  if (!iso) return 0n;
  const ms = Date.parse(iso);
  return isNaN(ms) ? 0n : BigInt(Math.floor(ms / 1000));
}

function deriveCancellationReason(statusText: string): string {
  const upper = statusText.toUpperCase();
  if (upper.includes("WEATHER"))    return "WEATHER";
  if (upper.includes("MECHANICAL")) return "MECHANICAL";
  if (upper.includes("CREW"))       return "CREW";
  if (upper.includes("DIVERTED"))   return "DIVERTED";
  return "UNKNOWN";
}
