import "dotenv/config";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export const config = {
  rpcUrl:             requireEnv("RPC_URL"),
  aggregatorAddress:  requireEnv("AGGREGATOR_ADDRESS"),
  oraclePrivateKey:   requireEnv("ORACLE_PRIVATE_KEY"),
  flightAwareApiKey:  requireEnv("FLIGHTAWARE_API_KEY"),
  delayThresholdMins: parseInt(process.env["DELAY_THRESHOLD_MINUTES"] ?? "15", 10),
} as const;
