#!/usr/bin/env bash
# Deploy FlightDataAggregator to Hedera Testnet.
# Requires: HEDERA_RPC_URL and HEDERA_PRIVATE_KEY in env or .env (source it).
# Get testnet HBAR: https://portal.hedera.com/ (faucet).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

[ -f .env ] && set -a && source .env && set +a
RPC_URL="${HEDERA_RPC_URL:-https://testnet.hashio.io/api}"
PRIVATE_KEY="${HEDERA_PRIVATE_KEY:-}"

if [ -z "$PRIVATE_KEY" ]; then
  echo "Set HEDERA_PRIVATE_KEY (or HEDERA_PRIVATE_KEY in .env)."
  exit 1
fi

echo "[deploy-hedera] Deploying FlightDataAggregator to Hedera Testnet..."
OUT=$(forge create contracts/FlightDataAggregator.sol:FlightDataAggregator \
  --rpc-url "$RPC_URL" \
  --private-key "$PRIVATE_KEY" \
  --broadcast 2>&1)
AGGREGATOR=$(echo "$OUT" | sed -n 's/Deployed to: \(0x[a-fA-F0-9]*\).*/\1/p')
[ -z "$AGGREGATOR" ] && { echo "$OUT"; exit 1; }

echo ""
echo "Deployed to: $AGGREGATOR"
echo ""
echo "Next:"
echo "  1. Set Controller and Oracle: cast send $AGGREGATOR \"setController(address)\" <CONTROLLER_ADDRESS> --rpc-url $RPC_URL --private-key \$HEDERA_PRIVATE_KEY"
echo "     then: cast send $AGGREGATOR \"setOracle(address)\" <ORACLE_ADDRESS> --rpc-url $RPC_URL --private-key \$HEDERA_PRIVATE_KEY"
echo "  2. Verify on HashScan: ./scripts/verify-hedera-testnet.sh $AGGREGATOR"
echo "  3. In flight-oracle/.env set: AGGREGATOR_ADDRESS=$AGGREGATOR and RPC_URL=$RPC_URL"
