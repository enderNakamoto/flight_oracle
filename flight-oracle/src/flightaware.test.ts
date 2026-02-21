import * as path from "path";
import * as fs from "fs";
import { parseFlightUpdate, type AeroApiFlight } from "./flightaware";
import { FlightStatus } from "./aggregator";

const MOCKS_DIR = path.join(__dirname, "..", "mocks");
const DELAY_THRESHOLD_MINS = 15;

function loadMock(name: string): { flights: AeroApiFlight[] } {
  const raw = fs.readFileSync(path.join(MOCKS_DIR, `${name}.json`), "utf-8");
  return JSON.parse(raw) as { flights: AeroApiFlight[] };
}

function isoToUnix(iso: string): bigint {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`Invalid ISO: ${iso}`);
  return BigInt(Math.floor(ms / 1000));
}

describe("parseFlightUpdate", () => {
  it("ontime-landed: status OnTime, has actualArrival", () => {
    const { flights } = loadMock("ontime-landed");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.OnTime);
    expect(update.scheduledArrival).toBe(isoToUnix("2026-02-21T01:22:00Z"));
    expect(update.actualArrival).toBe(isoToUnix("2026-02-21T01:27:00Z"));
    expect(update.cancellationReason).toBe("");
  });

  it("delayed-landed: status Delayed when arrival_delay > threshold", () => {
    const { flights } = loadMock("delayed-landed");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.Delayed);
    expect(update.actualArrival).toBe(isoToUnix("2026-02-21T01:42:00Z"));
    expect(update.cancellationReason).toBe("");
  });

  it("cancelled-weather: status Cancelled, reason WEATHER", () => {
    const { flights } = loadMock("cancelled-weather");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.Cancelled);
    expect(update.actualArrival).toBe(0n);
    expect(update.cancellationReason).toBe("WEATHER");
  });

  it("cancelled-mechanical: reason MECHANICAL", () => {
    const { flights } = loadMock("cancelled-mechanical");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.Cancelled);
    expect(update.cancellationReason).toBe("MECHANICAL");
  });

  it("cancelled-unknown: reason UNKNOWN when status has no keyword", () => {
    const { flights } = loadMock("cancelled-unknown");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.Cancelled);
    expect(update.cancellationReason).toBe("UNKNOWN");
  });

  it("inflight-ontime: status OnTime, actualArrival 0", () => {
    const { flights } = loadMock("inflight-ontime");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.OnTime);
    expect(update.actualArrival).toBe(0n);
  });

  it("inflight-delayed: status Delayed when departure_delay > threshold", () => {
    const { flights } = loadMock("inflight-delayed");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.Delayed);
    expect(update.actualArrival).toBe(0n);
  });

  it("landed-fallback-runway: uses actual_on when actual_in is null", () => {
    const { flights } = loadMock("landed-fallback-runway");
    const flight = flights[0]!;
    expect(flight.actual_in).toBeNull();
    expect(flight.actual_on).toBe("2026-02-21T11:58:00Z");

    const update = parseFlightUpdate(flight, DELAY_THRESHOLD_MINS);

    expect(update.status).toBe(FlightStatus.OnTime);
    expect(update.scheduledArrival).toBe(isoToUnix("2026-02-21T12:00:00Z"));
    expect(update.actualArrival).toBe(isoToUnix("2026-02-21T11:58:00Z"));
  });
});

describe("parseFlightUpdate with custom threshold", () => {
  it("delayed-landed becomes OnTime with threshold 25 min", () => {
    const { flights } = loadMock("delayed-landed");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, 25);

    expect(update.status).toBe(FlightStatus.OnTime);
  });

  it("ontime-landed stays OnTime with threshold 5 min", () => {
    const { flights } = loadMock("ontime-landed");
    const flight = flights[0]!;
    const update = parseFlightUpdate(flight, 5);

    expect(update.status).toBe(FlightStatus.OnTime);
  });
});
