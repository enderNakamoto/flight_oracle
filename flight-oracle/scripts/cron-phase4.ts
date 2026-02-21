/**
 * Phase 4: run oracle against Hedera Testnet with per-flight mocked FlightAware data.
 * Use flight-oracle/.env (RPC_URL, AGGREGATOR_ADDRESS, ORACLE_PRIVATE_KEY).
 *
 *   npx ts-node scripts/cron-phase4.ts         # single run (e.g. for cron)
 *   npx ts-node scripts/cron-phase4.ts --loop  # run every 10 min in process
 */
import "dotenv/config";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";

const PHASE4_DIR = path.join(__dirname, "..", "mocks", "phase4");

function loadMockForFlightId(flightId: string): unknown {
  const normalized = flightId.replace(/\s/g, "").toLowerCase();
  const file = path.join(PHASE4_DIR, `${normalized}.json`);
  if (!fs.existsSync(file)) return null;
  const raw = fs.readFileSync(file, "utf-8");
  return JSON.parse(raw) as unknown;
}

function installMock(): void {
  const mock = new MockAdapter(axios);
  mock.onGet(/aeroapi\.flightaware\.com\/aeroapi\/flights\/(\w+)/).reply((config) => {
    const match = config.url?.match(/\/flights\/(\w+)(\?|$)/);
    const flightId = match?.[1] ?? "";
    const data = loadMockForFlightId(flightId);
    if (!data) return [404, {}];
    return [200, data];
  });
}

function runOnce(): void {
  installMock();
  void import("../src/index");
}

function runOnceInSubprocess(): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      "npx",
      ["ts-node", path.join(__dirname, "cron-phase4.ts")],
      { stdio: "inherit", cwd: path.join(__dirname, ".."), env: process.env }
    );
    child.on("close", (code) => resolve(code ?? 0));
  });
}

const isLoop = process.argv.includes("--loop");

if (isLoop) {
  const TEN_MIN_MS = 10 * 60 * 1000;
  (async () => {
    console.log("[cron-phase4] Loop mode: run every 10 min.");
    for (;;) {
      console.log("[cron-phase4] Starting run...");
      const code = await runOnceInSubprocess();
      if (code !== 0) console.error("[cron-phase4] Run exited with", code);
      console.log("[cron-phase4] Next run in 10 min.");
      await new Promise((r) => setTimeout(r, TEN_MIN_MS));
    }
  })();
} else {
  runOnce();
}
