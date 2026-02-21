import axios from "axios";
import { config } from "./config";

const AEROAPI_BASE = "https://aeroapi.flightaware.com/aeroapi";

// -----------------------------------------------
// Types — only the fields we actually use
// -----------------------------------------------
export interface AeroApiFlight {
  ident:              string;
  ident_icao:         string | null;
  ident_iata:         string | null;
  fa_flight_id:       string;
  cancelled:          boolean;
  diverted:           boolean;
  status:             string;           // human-readable, not parsed
  departure_delay:    number | null;    // seconds, negative = early
  arrival_delay:      number | null;    // seconds, negative = early
  progress_percent:   number | null;
  scheduled_in:       string | null;    // ISO 8601 UTC — scheduled gate arrival
  estimated_in:       string | null;    // ISO 8601 UTC — estimated gate arrival
  actual_in:          string | null;    // ISO 8601 UTC — actual gate arrival (often null)
  scheduled_on:       string | null;    // ISO 8601 UTC — scheduled wheels-on (runway)
  actual_on:          string | null;    // ISO 8601 UTC — actual wheels-on (more reliable than gate)
}

interface AeroApiResponse {
  flights:   AeroApiFlight[];
  num_pages: number;
  links:     { next: string | null };
}

// -----------------------------------------------
// Fetch a specific flight on a specific UTC date.
//
// flightId:   ICAO ident e.g. "UAL123" (preferred) or IATA e.g. "UA123"
// flightDate: midnight UTC Unix timestamp (as stored in the contract)
//
// Returns the single best matching flight object, or null if not found.
// -----------------------------------------------
export async function fetchFlight(
  flightId:   string,
  flightDate: bigint
): Promise<AeroApiFlight | null> {
  // Convert the midnight UTC timestamp to ISO date strings for the API window
  const startDate = new Date(Number(flightDate) * 1000);
  const endDate   = new Date(Number(flightDate) * 1000 + 86_400_000); // +24h

  const startIso = startDate.toISOString().split("T")[0]!; // "YYYY-MM-DD"
  const endIso   = endDate.toISOString().split("T")[0]!;

  const url = `${AEROAPI_BASE}/flights/${encodeURIComponent(flightId)}`;

  try {
    const response = await axios.get<AeroApiResponse>(url, {
      headers: {
        "x-apikey": config.flightAwareApiKey,
        "Accept":   "application/json",
      },
      params: {
        start: startIso,
        end:   endIso,
        max_pages: 1,
      },
      timeout: 15_000,
    });

    const flights = response.data.flights;

    if (!flights || flights.length === 0) {
      console.warn(`[FlightAware] No flights found for ${flightId} on ${startIso}`);
      return null;
    }

    // If multiple legs returned (e.g. diverted), pick the most progressed one
    const sorted = [...flights].sort(
      (a, b) => (b.progress_percent ?? 0) - (a.progress_percent ?? 0)
    );

    return sorted[0] ?? null;

  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      if (status === 404) {
        console.warn(`[FlightAware] 404 — flight ${flightId} not found for date ${startIso}`);
        return null;
      }
      if (status === 429) {
        console.warn(`[FlightAware] 429 — rate limit hit for ${flightId}`);
        return null;
      }
      console.error(`[FlightAware] HTTP ${status} for ${flightId}: ${err.message}`);
    } else {
      console.error(`[FlightAware] Unexpected error for ${flightId}:`, err);
    }
    return null;
  }
}

// -----------------------------------------------
// Parse a raw AeroAPI flight object into the fields
// the aggregator contract expects.
// -----------------------------------------------
export interface ParsedFlightUpdate {
  status:             number;  // FlightStatus enum value
  scheduledArrival:   bigint;  // Unix timestamp (0 if unknown)
  actualArrival:      bigint;  // Unix timestamp (0 if not yet landed)
  cancellationReason: string;  // bytes32-compatible string, empty if not cancelled
}

export function parseFlightUpdate(
  flight:             AeroApiFlight,
  delayThresholdMins: number
): ParsedFlightUpdate {

  // --- Scheduled arrival: prefer scheduled_in (gate), fall back to scheduled_on (runway) ---
  const scheduledArrival = isoToUnix(flight.scheduled_in ?? flight.scheduled_on);

  // --- Actual arrival: prefer actual_in (gate), fall back to actual_on (runway) ---
  // actual_in is null 15-50% of the time per AeroAPI docs; actual_on is more reliable
  const actualArrival = isoToUnix(flight.actual_in ?? flight.actual_on);

  // --- Cancellation ---
  if (flight.cancelled) {
    // AeroAPI has no cancellation reason field — derive a best-effort reason from status string
    const reason = deriveCancellationReason(flight.status);
    return {
      status:             3, // FlightStatus.Cancelled
      scheduledArrival,
      actualArrival:      0n,
      cancellationReason: reason,
    };
  }

  // --- Landed: progress 100% and actual arrival available ---
  if (flight.progress_percent === 100 && actualArrival > 0n) {
    const delaySeconds = flight.arrival_delay ?? 0;
    const isDelayed    = delaySeconds > delayThresholdMins * 60;
    return {
      status:             isDelayed ? 2 : 1, // Delayed or OnTime
      scheduledArrival,
      actualArrival,
      cancellationReason: "",
    };
  }

  // --- In-flight or pre-departure ---
  const delaySeconds = flight.arrival_delay ?? flight.departure_delay ?? 0;
  const isDelayed    = delaySeconds > delayThresholdMins * 60;

  return {
    status:             isDelayed ? 2 : 1, // Delayed or OnTime
    scheduledArrival,
    actualArrival:      0n,
    cancellationReason: "",
  };
}

// -----------------------------------------------
// Helpers
// -----------------------------------------------

function isoToUnix(iso: string | null | undefined): bigint {
  if (!iso) return 0n;
  const ms = Date.parse(iso);
  if (isNaN(ms)) return 0n;
  return BigInt(Math.floor(ms / 1000));
}

function deriveCancellationReason(statusText: string): string {
  const upper = statusText.toUpperCase();
  // Best-effort extraction — AeroAPI does not expose a machine-readable reason
  if (upper.includes("WEATHER"))    return "WEATHER";
  if (upper.includes("MECHANICAL")) return "MECHANICAL";
  if (upper.includes("CREW"))       return "CREW";
  if (upper.includes("DIVERTED"))   return "DIVERTED";
  return "UNKNOWN";
}
