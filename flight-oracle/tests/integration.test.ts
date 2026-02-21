/**
 * Phase 2 integration: run the oracle against a local chain with FlightAware mocked.
 * Apply the mock before loading the oracle so axios returns mocks/flightaware-response.json.
 *
 *   npx ts-node tests/integration.test.ts
 *
 * Requires: .env with RPC_URL, AGGREGATOR_ADDRESS, ORACLE_PRIVATE_KEY (3rd Anvil account).
 * FLIGHTAWARE_API_KEY can be "mock" — it is not used because axios is mocked.
 */
import "dotenv/config";
import axios from "axios";
import MockAdapter from "axios-mock-adapter";

const mockFlight = require("../mocks/flightaware-response.json");

const mock = new MockAdapter(axios);
mock.onGet(/aeroapi\.flightaware\.com/).reply(200, mockFlight);

// Load oracle after mock is attached so flightaware.ts uses the same axios instance
void import("../src/index");
