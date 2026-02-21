/**
 * One-time: register Phase 4 flights (UAL1200, UAL1201) on the aggregator.
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

const FLIGHT_IDS = ["UAL1200", "UAL1201"];

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

  const signerAddress = await signer.getAddress();
  console.log(`Aggregator: ${AGGREGATOR_ADDRESS}`);
  console.log(`Controller (signer): ${signerAddress}`);

  const balance = await provider.getBalance(signerAddress);
  console.log(`Signer balance: ${ethers.formatEther(balance)} (wei: ${balance})`);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const flightDate = BigInt(Math.floor(today.getTime() / 1000));

  for (const flightId of FLIGHT_IDS) {
    const tx = await contract.registerFlight(flightId, flightDate);
    console.log(`Registered ${flightId}: ${tx.hash}`);
    await tx.wait();
  }
  console.log(`Both flights registered. flightDate (UTC midnight): ${flightDate}`);
}

// NotController() selector — contract rejects if signer is not authorizedController
const NOT_CONTROLLER_SELECTOR = "0x23019e67";

main().catch((err: unknown) => {
  const data = (err as { data?: string })?.data ?? (err as { info?: { error?: { data?: string } } })?.info?.error?.data;
  if (typeof data === "string" && data === NOT_CONTROLLER_SELECTOR) {
    console.error("Error: NotController — the wallet from CONTROLLER_PRIVATE_KEY / HEDERA_PRIVATE_KEY is not the aggregator's authorized controller.");
    console.error("Fix: Call setController(yourAddress) on the aggregator (as owner). Your address: run  cast wallet address $HEDERA_PRIVATE_KEY");
    console.error("Then: cast send $AGGREGATOR_ADDRESS \"setController(address)\" $(cast wallet address $HEDERA_PRIVATE_KEY) --rpc-url $RPC_URL --private-key $HEDERA_PRIVATE_KEY");
  } else {
    console.error(err);
  }
  process.exit(1);
});
