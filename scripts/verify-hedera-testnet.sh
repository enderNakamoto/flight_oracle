#!/usr/bin/env bash
# Verify FlightDataAggregator on HashScan (Hedera Testnet).
# Usage: ./scripts/verify-hedera-testnet.sh [CONTRACT_ADDRESS]
# Or set AGGREGATOR_ADDRESS in env.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ADDR="${1:-$AGGREGATOR_ADDRESS}"
[ -z "$ADDR" ] && { echo "Usage: $0 <contract_address> or set AGGREGATOR_ADDRESS"; exit 1; }

echo "[verify-hedera] Verifying $ADDR on HashScan (Hedera Testnet)..."
forge verify-contract "$ADDR" contracts/FlightDataAggregator.sol:FlightDataAggregator \
  --chain-id 296 \
  --verifier sourcify \
  --verifier-url "https://server-verify.hashscan.io/"

echo "Done. Check https://hashscan.io/testnet/contract/$ADDR"
