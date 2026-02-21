/**
 * std_shim_acu.d.ts
 *
 * TypeScript type declarations for Acurast TEE injected globals.
 * These are NOT available in standard Node.js — they are injected
 * by the Acurast runtime at execution time.
 *
 * In local simulation mode (LOCAL_MODE=true) we polyfill these
 * with standard Node.js equivalents in polyfill_acu.ts.
 */

declare global {
  /**
   * _STD_ — the main Acurast injected namespace.
   * Available in all TEE executions.
   */
  const _STD_: {
    // Encrypted environment variables decrypted at TEE runtime
    env: Record<string, string>;

    // Chain interaction namespace
    chains: {
      ethereum: {
        // Encode a value for ABI submission
        abi: {
          encode(value: string | number | unknown[]): string;
          encodeNumeric(value: number | string, bitLength: number, isNatural: boolean): string;
          encodeStruct(value: unknown, isDynamic: boolean): string;
        };
        // Get the TEE processor's Ethereum address
        getAddress(): string;
        // Submit a transaction to an EVM contract
        fulfill(
          rpcUrl: string,
          contractAddress: string,
          payload: string,
          extra: {
            methodSignature?: string;
            gasLimit?: string;
            maxPriorityFeePerGas?: string;
            maxFeePerGas?: string;
          },
          onSuccess: (operationHash: string) => void,
          onError: (errors: string[]) => void
        ): void;
        signer: {
          sign(message: string): string;
        };
      };
    };
  };

  /**
   * httpGET — callback-based HTTP GET injected by the Acurast runtime.
   * Provides TLS certificate attestation via the certificate param.
   */
  function httpGET(
    url: string,
    headers: Record<string, string>,
    onSuccess: (payload: string, certificate: string) => void,
    onError: (error: string) => void
  ): void;

  /**
   * httpPOST — callback-based HTTP POST injected by the Acurast runtime.
   */
  function httpPOST(
    url: string,
    body: string,
    headers: Record<string, string>,
    onSuccess: (payload: string, certificate: string) => void,
    onError: (error: string) => void
  ): void;

  /**
   * print — Acurast's console.log equivalent (also logs to processor output).
   */
  function print(message: string): void;

  /**
   * environment — shorthand for _STD_.env[key]
   */
  function environment(key: string): string;
}

export {};
