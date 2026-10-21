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

/**
 * What a send call reports back. A payout is recorded as soon as it is
 * broadcast, so the caller needs the hash (or the relayer id to find it later)
 * and whether the network has already settled it — not a single hash string
 * that can only be produced by blocking until confirmation.
 */
export type SendResult = {
  /** The real network transaction hash, or null if only a relayer id exists. */
  txHash: string | null;
  /** True when the network/relayer already reported final success. */
  confirmed: boolean;
  /** GasFree transfer id, needed to confirm a TRC-20 payout later. */
  transferId: string | null;
};

/** How a later confirmation check came out. */
export type ConfirmationResult = {
  settled: "confirmed" | "failed" | "pending";
  /** The real hash, once the network publishes it. */
  txHash: string | null;
  /** Human-readable detail for a failure. */
  detail: string;
};
