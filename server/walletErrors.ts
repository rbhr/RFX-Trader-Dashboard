/**
 * Typed errors for the custodial wallet send paths (tron.ts / erc20.ts).
 * Callers must distinguish "definitively failed" from "submitted but
 * unconfirmed" — string-matching error messages is too fragile for money.
 */

/** The transfer definitively failed on-chain / was rejected. Nothing was sent. */
export class TxFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TxFailedError";
  }
}

/**
 * The transfer was broadcast but confirmation did not complete in time.
 * It may still succeed on-chain. `txHash` is the real transaction hash when
 * the network returned one (ERC-20 always has it; GasFree may only have a
 * transfer ID).
 */
export class TxPendingError extends Error {
  txHash: string | null;
  constructor(message: string, txHash: string | null = null) {
    super(message);
    this.name = "TxPendingError";
    this.txHash = txHash;
  }
}
