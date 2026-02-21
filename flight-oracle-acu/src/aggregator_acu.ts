/**
 * aggregator_acu.ts
 *
 * Contract interaction layer for the Acurast TEE oracle.
 *
 * READ  (getActiveFlights): uses Node.js fetch() — available in Node v20
 *       since _STD_.chains.ethereum has no view-call helper, we call the RPC
 *       directly via JSON-RPC eth_call.
 *
 * WRITE (updateFlightStatus): uses _STD_.chains.ethereum.fulfill() which
 *       handles signing and broadcast natively inside the TEE.
 *       In local simulation mode polyfill_acu.ts replaces this with ethers.
 */

import { ethers } from "ethers";
import { config } from "./config_acu";

// -----------------------------------------------
// FlightStatus enum — must match IOracleAggregator.sol exactly
// -----------------------------------------------
export enum FlightStatus {
  Unknown   = 0,
  OnTime    = 1,
  Delayed   = 2,
  Cancelled = 3,
}

// -----------------------------------------------
// Type returned by getActiveFlights()
// -----------------------------------------------
export interface ActiveFlight {
  flightId:   string;
  flightDate: bigint;
}

// -----------------------------------------------
// Minimal ABI fragments — only what we need
// -----------------------------------------------
const AGGREGATOR_IFACE = new ethers.Interface([
  "function getActiveFlights() view returns (tuple(string flightId, uint256 flightDate)[])",
  "function updateFlightStatus(string flightId, uint256 flightDate, uint8 status, uint256 scheduledArrival, uint256 actualArrival, bytes32 cancellationReason)",
]);

// -----------------------------------------------
// READ: getActiveFlights via raw eth_call JSON-RPC
//
// We use fetch() (Node v20 built-in) instead of ethers provider because
// _STD_.chains.ethereum has no view-call helper — only fulfill() for writes.
// In local mode fetch() works natively; in TEE fetch() also works (Node v20).
// -----------------------------------------------
export async function getActiveFlights(): Promise<ActiveFlight[]> {
  const calldata = AGGREGATOR_IFACE.encodeFunctionData("getActiveFlights", []);

  const body = JSON.stringify({
    jsonrpc: "2.0",
    method:  "eth_call",
    params:  [{ to: config.aggregatorAddress, data: calldata }, "latest"],
    id:      1,
  });

  const response = await fetch(config.rpcUrl, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!response.ok) {
    throw new Error(`[aggregator_acu] RPC HTTP error: ${response.status}`);
  }

  const json = (await response.json()) as { result?: string; error?: { message: string } };

  if (json.error) {
    throw new Error(`[aggregator_acu] eth_call error: ${json.error.message}`);
  }

  if (!json.result || json.result === "0x") {
    print("[aggregator_acu] getActiveFlights returned empty — no active flights");
    return [];
  }

  // Decode the ABI-encoded response
  const decoded = AGGREGATOR_IFACE.decodeFunctionResult("getActiveFlights", json.result);
  const raw = decoded[0] as Array<{ flightId: string; flightDate: bigint }>;

  return raw.map((item) => ({
    flightId:   item.flightId,
    flightDate: item.flightDate,
  }));
}

// -----------------------------------------------
// WRITE: updateFlightStatus via _STD_.chains.ethereum.fulfill()
//
// Encodes the calldata with ethers, then hands it to _STD_ for signing + broadcast.
// In local mode the polyfill in polyfill_acu.ts handles the actual sendTransaction.
// -----------------------------------------------
export async function pushFlightStatus(
  flightId:           string,
  flightDate:         bigint,
  status:             FlightStatus,
  scheduledArrival:   bigint,
  actualArrival:      bigint,
  cancellationReason: string
): Promise<void> {
  const reasonBytes32 = ethers.encodeBytes32String(
    cancellationReason.slice(0, 31) // bytes32 max 31 chars + null terminator
  );

  const calldata = AGGREGATOR_IFACE.encodeFunctionData("updateFlightStatus", [
    flightId,
    flightDate,
    status,
    scheduledArrival,
    actualArrival,
    reasonBytes32,
  ]);

  const label = `${flightId}@${flightDate}`;

  return new Promise((resolve, reject) => {
    _STD_.chains.ethereum.fulfill(
      config.rpcUrl,
      config.aggregatorAddress,
      calldata,
      {
        methodSignature: "updateFlightStatus(string,uint256,uint8,uint256,uint256,bytes32)",
        gasLimit:        "500000",
        maxFeePerGas:    "50000000000", // 50 gwei — adjust for target chain
      },
      (txHash) => {
        print(`[aggregator_acu] ✓ ${label} confirmed: ${txHash}`);
        resolve();
      },
      (errors) => {
        print(`[aggregator_acu] ✗ ${label} failed: ${errors.join(", ")}`);
        reject(new Error(errors.join(", ")));
      }
    );
  });
}
