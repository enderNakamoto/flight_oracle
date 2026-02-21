# FlightAware response mocks

These files are used by `src/flightaware.test.ts` to test `parseFlightUpdate()` against different API response cases.

| File | Case | Expected status | Notes |
|------|------|-----------------|--------|
| `ontime-landed.json` | Landed, delay &le; threshold | OnTime (1) | `arrival_delay` 300s (5 min), `progress_percent` 100 |
| `delayed-landed.json` | Landed, delay &gt; threshold | Delayed (2) | `arrival_delay` 1200s (20 min), threshold 15 min |
| `cancelled-weather.json` | Cancelled, status contains "Weather" | Cancelled (3), reason WEATHER | |
| `cancelled-mechanical.json` | Cancelled, status contains "Mechanical" | Cancelled (3), reason MECHANICAL |
| `cancelled-unknown.json` | Cancelled, no known keyword | Cancelled (3), reason UNKNOWN |
| `inflight-ontime.json` | In flight, delay &le; threshold | OnTime (1), `actualArrival` 0 | `progress_percent` 50 |
| `inflight-delayed.json` | In flight, delay &gt; threshold | Delayed (2), `actualArrival` 0 |
| `landed-fallback-runway.json` | Landed, gate time null | OnTime, uses `actual_on` for `actualArrival` | `actual_in` null, `actual_on` set |
| `empty.json` | No flights | N/A | Used for fetch/empty-response tests if needed |
| `flightaware-response.json` | Multi-leg sample | N/A | Original full response; multiple legs for same flight number |

Tests use `DELAY_THRESHOLD_MINUTES = 15` unless overridden.
