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

/**
 * The wallet cannot take another transfer *yet*, and nothing was sent.
 *
 * Deliberately distinct from `TxFailedError`, which means this payout will
 * never work. A busy wallet means the *same* payout can be retried unchanged
 * once the previous one clears, so the caller should wait rather than report a
 * failure an admin will go looking for a cause for.
 *
 * GasFree accepts one transfer at a time per account, and a payout now returns
 * as soon as the hash is published rather than when the transfer settles — so
 * even a strictly serial run of payouts routinely reaches the next submit while
 * the previous transfer is still pending. That is back-pressure, not failure.
 */
export class WalletBusyError extends Error {
  /** Roughly how long to wait before retrying the same payout. */
  retryAfterMs: number;
  constructor(message: string, retryAfterMs = 20_000) {
    super(message);
    this.name = "WalletBusyError";
    this.retryAfterMs = retryAfterMs;
  }
}
