import { ethers } from "ethers";
import { config } from "./config";

// -----------------------------------------------
// Minimal ABI — only the functions this oracle uses
// -----------------------------------------------
export const AGGREGATOR_ABI = [
  // Read: get list of flights to track
  {
    name: "getActiveFlights",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "flightId",   type: "string"  },
          { name: "flightDate", type: "uint256" },
        ],
      },
    ],
  },
  // Write: push updated status back on-chain
  {
    name: "updateFlightStatus",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "flightId",           type: "string"  },
      { name: "flightDate",         type: "uint256" },
      { name: "status",             type: "uint8"   }, // FlightStatus enum: 0=Unknown 1=OnTime 2=Delayed 3=Cancelled
      { name: "scheduledArrival",   type: "uint256" },
      { name: "actualArrival",      type: "uint256" },
      { name: "cancellationReason", type: "bytes32" },
    ],
    outputs: [],
  },
] as const;

// -----------------------------------------------
// FlightStatus enum — must match IOracleAggregator.sol
// -----------------------------------------------
export enum FlightStatus {
  Unknown   = 0,
  OnTime    = 1,
  Delayed   = 2,
  Cancelled = 3,
}

// -----------------------------------------------
// Types returned by getActiveFlights()
// -----------------------------------------------
export interface ActiveFlight {
  flightId:   string;
  flightDate: bigint; // uint256 from ethers v6 comes back as bigint
}

// -----------------------------------------------
// Contract client — wraps provider + signer setup
// -----------------------------------------------
export function buildAggregatorContract() {
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer   = new ethers.Wallet(config.oraclePrivateKey, provider);

  const readContract  = new ethers.Contract(config.aggregatorAddress, AGGREGATOR_ABI, provider);
  const writeContract = new ethers.Contract(config.aggregatorAddress, AGGREGATOR_ABI, signer);

  return { provider, signer, readContract, writeContract };
}
