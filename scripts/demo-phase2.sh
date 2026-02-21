#!/usr/bin/env bash
# Phase 2 demo: local chain + mocked API. Requires Anvil running (anvil).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[demo-phase2] Checking Anvil..."
curl -s -X POST http://localhost:8545 -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' >/dev/null || {
  echo "Run 'anvil' in another terminal first."
  exit 1
}

echo "[demo-phase2] Deploying aggregator..."
OUT=$(forge create contracts/FlightDataAggregator.sol:FlightDataAggregator \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast 2>&1)
AGGREGATOR=$(echo "$OUT" | sed -n 's/Deployed to: \(0x[a-fA-F0-9]*\).*/\1/p')
[ -z "$AGGREGATOR" ] && { echo "$OUT"; exit 1; }

echo "[demo-phase2] Wiring Controller and Oracle..."
cast send "$AGGREGATOR" "setController(address)" 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 >/dev/null 2>&1
cast send "$AGGREGATOR" "setOracle(address)" 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  --rpc-url http://localhost:8545 --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 >/dev/null 2>&1

echo "[demo-phase2] Writing flight-oracle/.env and registering flight..."
mkdir -p "$ROOT/flight-oracle"
cat > "$ROOT/flight-oracle/.env" << EOF
RPC_URL=http://localhost:8545
AGGREGATOR_ADDRESS=$AGGREGATOR
ORACLE_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
FLIGHTAWARE_API_KEY=mock
DELAY_THRESHOLD_MINUTES=15
EOF
cd "$ROOT/flight-oracle"
npx ts-node scripts/registerTestFlight.ts

echo "[demo-phase2] Running oracle (mocked FlightAware)..."
npx ts-node tests/integration.test.ts

echo "[demo-phase2] Verifying on-chain..."
FLIGHT_DATE=$(node -e "const d=new Date(); d.setUTCHours(0,0,0,0); console.log(Math.floor(d.getTime()/1000))")
STATUS=$(cast call "$AGGREGATOR" "getFlightStatus(string,uint256)" "UAL123" "$FLIGHT_DATE" --rpc-url http://localhost:8545)
echo "getFlightStatus(UAL123, $FLIGHT_DATE) => $STATUS (1=OnTime 2=Delayed 3=Cancelled)"
echo "[demo-phase2] Done."
