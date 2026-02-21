# FlightDataAggregator — Architecture & Access Control

## System Context

This contract is part of a **Hedera-based flight delay insurance protocol**. It acts as the on-chain source of truth for flight statuses. The system has three moving parts:

- **FlightDataAggregator** — this contract. Stores flight status data and serves as the single point of truth.
- **Controller** — an on-chain contract that manages insurance pool lifecycles. It reads from the Aggregator on a fixed schedule to decide when to settle claims.
- **Off-chain Oracle Service** — a backend process that polls external flight APIs and pushes results into the Aggregator.

The flow looks like this:

```
[External Flight API]
        ↓  (HTTP)
[Off-chain Oracle Service]  ──updateFlightStatus()──→  [FlightDataAggregator]
                                                                ↑
[HSS Scheduled Loop] → triggers every 10 min               registerFlight()
                                                            deregisterFlight()
        ↓                                                   getFlightStatus()
[Controller Contract]  ─────────────────────────────────────────┘
```

The Aggregator is intentionally passive — it does not initiate anything. It only responds to calls from two authorized addresses and holds only the data it needs right now (no historical accumulation).

---

## Access Control Roles

There are three roles in this contract:

### 1. `owner`
Set to the deployer at construction. Responsible only for the one-time post-deployment wiring of the other two roles. Has no ongoing operational power once wiring is complete.

Allowed to call:
- `setController(address)` — once only, locks after first call
- `setOracle(address)` — once only, locks after first call

### 2. `authorizedController`
The deployed Controller contract address. Set once by owner via `setController()`. This is the only address the Aggregator trusts for insurance lifecycle events.

Allowed to call:
- `registerFlight()` — when a new FlightPool is created
- `deregisterFlight()` — when a FlightPool fully settles and is cleared
- `getFlightStatus()` — every 10 minutes via the HSS scheduled loop, to check whether a flight has reached a final status

### 3. `authorizedOracle`
The off-chain oracle service's signing address (an EOA or a contract). Set once by owner via `setOracle()`. This is the only address the Aggregator trusts for flight data updates.

Allowed to call:
- `getActiveFlights()` — read-only, to know which flights to query from the external API
- `updateFlightStatus()` — to push new status, arrival times, and delay data on-chain

---

## Deployment Order & Wiring

Because the Controller needs the Aggregator's address at construction, and the Aggregator needs the Controller's address for access control, this is a classic circular dependency resolved by deploying first and wiring second:

```
Step 1 — Deploy FlightDataAggregator         → aggregatorAddress
Step 2 — Deploy Controller(aggregatorAddress) → controllerAddress
Step 3 — aggregator.setController(controllerAddress)
Step 4 — aggregator.setOracle(oracleSignerAddress)
```

Steps 3 and 4 are owner-only and each can only be called once. After these calls, the owner has no further privileged access.

---

## What the Controller Contract Must Implement

The Controller must hold the Aggregator's address (passed at construction) and call the following three functions across two workflows:

### On FlightPool creation
```solidity
IOracleAggregator(aggregator).registerFlight(flightId, flightDate);
```
This tells the Aggregator to start tracking the flight and makes it visible to the oracle's polling service.

### Every 10 minutes (HSS scheduled loop)
```solidity
IOracleAggregator.FlightStatus status = IOracleAggregator(aggregator).getFlightStatus(flightId, flightDate);
```
The Controller reads the current status and applies settlement logic:

| Status | Controller action |
|--------|-------------------|
| `Unknown` | No action — oracle hasn't pushed data yet |
| `OnTime` | No action — flight is running normally |
| `Delayed` | Depending on threshold config — may trigger partial or full payout |
| `Cancelled` | Trigger full payout to insured parties |

### On FlightPool settlement and clearance
```solidity
IOracleAggregator(aggregator).deregisterFlight(flightId, flightDate);
```
Called after the pool has fully paid out and is being cleared. This frees all storage for that flight in the Aggregator, keeping the contract lean.

### Interface the Controller must import
```solidity
import "./IOracleAggregator.sol";
```
The Controller should depend only on the interface, not the implementation. This means if the Aggregator is ever redeployed (e.g. upgraded oracle logic), the Controller does not need to change — only the wired address needs updating.

---

## Data Lifecycle Summary

```
registerFlight()      → FlightRecord created, status = Unknown
updateFlightStatus()  → status evolves: Unknown → OnTime / Delayed / Cancelled
getFlightStatus()     → Controller reads status every 10 min
deregisterFlight()    → FlightRecord deleted, storage freed
```

A flight record exists on-chain **only for as long as its insurance pool is active**. Once settled, it is fully deleted. The Aggregator never accumulates stale historical data.
