/**
 * One-time: register Phase 4 flights (UAL1201–UAL1210) on the aggregator.
 * Controller must be set on the contract (e.g. deployer). Run from flight-oracle/ with
 * .env containing RPC_URL, AGGREGATOR_ADDRESS, and CONTROLLER_PRIVATE_KEY or HEDERA_PRIVATE_KEY.
 *
 *   cd flight-oracle && npx ts-node scripts/registerPhase4Flights.ts
 */
import "dotenv/config";
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL ?? "https://testnet.hashio.io/api";
const AGGREGATOR_ADDRESS = process.env.AGGREGATOR_ADDRESS;
const CONTROLLER_PRIVATE_KEY =
  process.env.CONTROLLER_PRIVATE_KEY ?? process.env.HEDERA_PRIVATE_KEY;

const FLIGHT_IDS = [
  "UAL1201",
  "UAL1202",
  "UAL1203",
  "UAL1204",
  "UAL1205",
  "UAL1206",
  "UAL1207",
  "UAL1208",
  "UAL1209",
  "UAL1210",
];

if (!AGGREGATOR_ADDRESS) {
  console.error("Missing AGGREGATOR_ADDRESS in .env");
  process.exit(1);
}
if (!CONTROLLER_PRIVATE_KEY) {
  console.error("Missing CONTROLLER_PRIVATE_KEY or HEDERA_PRIVATE_KEY in .env");
  process.exit(1);
}

const ABI = ["function registerFlight(string,uint256) external"];

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(CONTROLLER_PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(AGGREGATOR_ADDRESS!, ABI, signer);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const flightDate = BigInt(Math.floor(today.getTime() / 1000));

  for (const flightId of FLIGHT_IDS) {
    const tx = await contract.registerFlight(flightId, flightDate);
    console.log(`Registered ${flightId}: ${tx.hash}`);
    await tx.wait();
  }
  console.log(`All 10 flights registered. flightDate (UTC midnight): ${flightDate}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
