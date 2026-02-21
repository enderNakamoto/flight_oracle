// Dummy env so config.ts does not throw when tests import flightaware/aggregator
process.env.RPC_URL = process.env.RPC_URL || "https://localhost:8545";
process.env.AGGREGATOR_ADDRESS = process.env.AGGREGATOR_ADDRESS || "0x0000000000000000000000000000000000000000";
process.env.ORACLE_PRIVATE_KEY = process.env.ORACLE_PRIVATE_KEY || "0x0000000000000000000000000000000000000000000000000000000000000001";
process.env.FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY || "test-key";
