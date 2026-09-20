/**
 * App-wide toast: the same calls as sonner's `toast`, but notifications wait
 * for each other instead of stacking, and stay up a little longer.
 *
 * Several saves fire together (Edit Trader writes the trader, the risk limit,
 * the trading controls and the copy settings), and their toasts used to land on
 * top of one another and expire together before they could be read.
 */
import { toast as sonner, type ExternalToast } from "sonner";

type Kind = "success" | "error" | "info" | "warning";
type Message = Parameters<typeof sonner.success>[0];

// sonner's own default is 4000ms.
const DEFAULT_DURATION_MS = 5500;
// A beat between two toasts, so the change of message registers.
const GAP_MS = 250;
// If sonner never reports the toast closing, move on anyway.
const STALL_GRACE_MS = 2000;

const queue: Array<() => void> = [];
let showing = false;

function showNext() {
  const job = queue.shift();
  if (!job) {
    showing = false;
    return;
  }
  showing = true;
  job();
}

function enqueue(kind: Kind, message: Message, options?: ExternalToast) {
  queue.push(() => {
    const duration = options?.duration ?? DEFAULT_DURATION_MS;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(stall);
      setTimeout(showNext, GAP_MS);
    };
    const stall = setTimeout(
      finish,
      (Number.isFinite(duration) ? duration : 60_000) + STALL_GRACE_MS
    );
    sonner[kind](message, {
      ...options,
      duration,
      onAutoClose: t => {
        options?.onAutoClose?.(t);
        finish();
      },
      onDismiss: t => {
        options?.onDismiss?.(t);
        finish();
      },
    });
  });
  if (!showing) showNext();
}

export const toast = {
  success: (message: Message, options?: ExternalToast) =>
    enqueue("success", message, options),
  error: (message: Message, options?: ExternalToast) =>
    enqueue("error", message, options),
  info: (message: Message, options?: ExternalToast) =>
    enqueue("info", message, options),
  warning: (message: Message, options?: ExternalToast) =>
    enqueue("warning", message, options),
  // Progress toasts stay up until dismissed, so they sit outside the queue.
  loading: sonner.loading,
  dismiss: sonner.dismiss,
};
