/**
 * config_acu.ts
 *
 * Configuration for the Acurast TEE oracle.
 *
 * On a real Acurast processor:   reads from _STD_.env (encrypted, injected at runtime)
 * In local simulation mode:      reads from process.env via the polyfill_acu.ts proxy
 *
 * The code here never references process.env directly — it always uses _STD_.env
 * so the same bundle works identically in both environments.
 */

function requireEnv(key: string): string {
  const value = _STD_.env[key];
  if (!value) throw new Error(`[config_acu] Missing required env var: ${key}`);
  return value;
}

export const config = {
  rpcUrl:             requireEnv("RPC_URL"),
  aggregatorAddress:  requireEnv("AGGREGATOR_ADDRESS"),
  flightAwareApiKey:  requireEnv("FLIGHTAWARE_API_KEY"),
  delayThresholdMins: parseInt(_STD_.env["DELAY_THRESHOLD_MINUTES"] ?? "15", 10),
} as const;

// Note: there is no ORACLE_PRIVATE_KEY here.
// On a real Acurast processor the TEE holds the private key natively — transactions
// are signed by _STD_.chains.ethereum.fulfill() without ever exposing the key.
// In local simulation mode, polyfill_acu.ts reads ORACLE_PRIVATE_KEY from .env.acu
// and uses it inside the fulfill() polyfill.
