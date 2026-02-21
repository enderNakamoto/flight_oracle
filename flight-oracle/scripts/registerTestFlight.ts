/**
 * Register a test flight on the aggregator for Phase 2 local chain testing.
 * Uses the Controller EOA (2nd Anvil account). Run from flight-oracle/ with
 * .env containing AGGREGATOR_ADDRESS and optionally RPC_URL.
 *
 *   npx ts-node scripts/registerTestFlight.ts
 */
import "dotenv/config";
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL ?? "http://localhost:8545";
const AGGREGATOR_ADDRESS = process.env.AGGREGATOR_ADDRESS;

// 2nd Anvil account — must match the address passed to setController()
const CONTROLLER_PRIVATE_KEY =
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

if (!AGGREGATOR_ADDRESS) {
  console.error("Missing AGGREGATOR_ADDRESS in .env");
  process.exit(1);
}

const ABI = ["function registerFlight(string,uint256) external"];

async function main(): Promise<void> {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer = new ethers.Wallet(CONTROLLER_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(AGGREGATOR_ADDRESS!, ABI, signer);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const flightDate = BigInt(Math.floor(today.getTime() / 1000));

  const tx = await contract.registerFlight("UAL123", flightDate);
  console.log("Tx submitted:", tx.hash);
  await tx.wait();
  console.log("Flight registered: UAL123 @", flightDate.toString());
  console.log(
    "To verify later: cast call",
    AGGREGATOR_ADDRESS,
    '"getFlightStatus(string,uint256)" "UAL123"',
    flightDate.toString(),
    "--rpc-url",
    RPC_URL
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
