/**
 * polyfill_acu.ts
 *
 * Local simulation of Acurast TEE injected globals (_STD_, httpGET, print, environment).
 *
 * When LOCAL_MODE=true this file is imported FIRST by index_acu.ts and installs
 * Node.js equivalents of all TEE globals onto globalThis. The rest of the code
 * (config_acu.ts, aggregator_acu.ts, flightaware_acu.ts) is completely unaware
 * of whether it is running locally or inside a real TEE — it always uses the
 * same _STD_ API surface.
 *
 * On a real Acurast processor this file is never executed — the real globals
 * are already injected by the runtime before the bundle starts.
 */

import https from "https";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load .env.acu for local simulation
const envPath = path.resolve(process.cwd(), ".env.acu");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
} else {
  dotenv.config(); // fall back to .env
}

// -----------------------------------------------
// Polyfill: print
// -----------------------------------------------
(globalThis as any).print = (message: string) => {
  console.log(`[TEE-sim] ${message}`);
};

// -----------------------------------------------
// Polyfill: environment()
// -----------------------------------------------
(globalThis as any).environment = (key: string): string => {
  const val = process.env[key];
  if (!val) throw new Error(`[polyfill] Missing env var: ${key}`);
  return val;
};

// -----------------------------------------------
// Polyfill: httpGET
// Node.js https.get equivalent with same callback signature as TEE runtime.
// The `certificate` param in success callback is left empty — attestation
// is only meaningful inside a real TEE.
// -----------------------------------------------
(globalThis as any).httpGET = (
  url: string,
  headers: Record<string, string>,
  onSuccess: (payload: string, certificate: string) => void,
  onError: (error: string) => void
): void => {
  const parsedUrl = new URL(url);
  const options = {
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    method: "GET",
    headers: {
      "Accept": "application/json",
      ...headers,
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => { data += chunk; });
    res.on("end", () => {
      if (res.statusCode && res.statusCode >= 400) {
        onError(`HTTP ${res.statusCode}: ${data}`);
        return;
      }
      onSuccess(data, ""); // empty cert — local mode only
    });
  });

  req.on("error", (err) => { onError(err.message); });
  req.setTimeout(15_000, () => {
    req.destroy();
    onError("Request timed out after 15s");
  });

  req.end();
};

// -----------------------------------------------
// Polyfill: _STD_
// -----------------------------------------------

// Local wallet — uses ORACLE_PRIVATE_KEY from .env.acu
function getLocalWallet(): ethers.Wallet {
  const key = process.env["ORACLE_PRIVATE_KEY"];
  if (!key) throw new Error("[polyfill] ORACLE_PRIVATE_KEY not set");
  return new ethers.Wallet(key);
}

(globalThis as any)._STD_ = {
  // Proxy process.env as the encrypted env store
  env: new Proxy({} as Record<string, string>, {
    get(_target, prop: string) {
      const val = process.env[prop];
      if (!val) throw new Error(`[polyfill] _STD_.env missing: ${prop}`);
      return val;
    },
  }),

  chains: {
    ethereum: {
      abi: {
        encode(value: string | number | unknown[]): string {
          // Simple passthrough — full ABI encoding handled by ethers in aggregator_acu.ts
          return String(value);
        },
        encodeNumeric(value: number | string, _bitLength: number, _isNatural: boolean): string {
          return String(value);
        },
        encodeStruct(value: unknown, _isDynamic: boolean): string {
          return JSON.stringify(value);
        },
      },

      getAddress(): string {
        return getLocalWallet().address;
      },

      // Polyfill for _STD_.chains.ethereum.fulfill:
      // In local mode we use ethers directly (same as the Render oracle does).
      // This means local simulation exercises the REAL contract call path.
      fulfill(
        rpcUrl: string,
        contractAddress: string,
        payload: string,
        extra: {
          methodSignature?: string;
          gasLimit?: string;
          maxFeePerGas?: string;
          maxPriorityFeePerGas?: string;
        },
        onSuccess: (hash: string) => void,
        onError: (errors: string[]) => void
      ): void {
        (async () => {
          try {
            const provider = new ethers.JsonRpcProvider(rpcUrl);
            const wallet   = getLocalWallet().connect(provider);
            const method   = extra.methodSignature ?? "fulfill(bytes)";

            // Build the transaction using the raw ABI calldata in payload
            const iface = new ethers.Interface([`function ${method}`]);

            // payload is already ABI-encoded by aggregator_acu.ts via ethers
            // so we send it as raw calldata
            const txResponse = await wallet.sendTransaction({
              to:       contractAddress,
              data:     payload,
              gasLimit: extra.gasLimit ? BigInt(extra.gasLimit) : 3_000_000n,
            });

            print(`[polyfill] Tx submitted: ${txResponse.hash}`);
            const receipt = await txResponse.wait();
            print(`[polyfill] Tx confirmed in block ${receipt?.blockNumber}`);
            onSuccess(txResponse.hash);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            onError([msg]);
          }
        })();
      },

      signer: {
        sign(message: string): string {
          // Synchronous local equivalent — real TEE signing is async but returns hex
          const wallet = getLocalWallet();
          // Use signMessageSync from ethers v6
          return wallet.signingKey.sign(ethers.hashMessage(message)).serialized;
        },
      },
    },
  },
};

console.log("[polyfill] Acurast TEE globals installed for local simulation");
console.log(`[polyfill] Oracle address: ${(globalThis as any)._STD_.chains.ethereum.getAddress()}`);
