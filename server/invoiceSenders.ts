import * as db from "./db";
import { GOOGLE_MAIL_SCOPES, sendAsGoogleSender } from "./googleMail";
import type { BuildMessageInput } from "./mime";
import type { PropFirmKey } from "./propAccounts";
import type { EmailSender } from "../drizzle/schema";

/**
 * Which mailbox an invoice goes out from.
 *
 * The sender varies per account, not per firm — some accounts are invoiced by
 * one person and some by another — so the per-account map is the primary
 * mechanism and the firm default is only the fallback. Both are overridable at
 * send time, because "the locked ones go out from sr@" is a statement about
 * today's accounts, not a rule that should survive an account unlocking.
 *
 * Addresses here are intent only. An address that has not completed
 * authorisation cannot send, and nothing falls back to a different person's
 * mailbox when it can't — a silently substituted sender on an invoice is worse
 * than a failed send.
 */

/** accountId -> sender address. */
export const INVOICE_SENDER_BY_ACCOUNT: Record<string, string> = {
  // Populate as the assignments are decided, e.g.
  // "7130985f-64df-4ff7-9635-15eb88b57d12": "helen.m.cooper@gmail.com",
};

/** Fallback when an account has no explicit assignment. */
export const INVOICE_SENDER_BY_FIRM: Partial<Record<PropFirmKey, string>> = {};

export function plannedSenderFor(params: {
  accountId: string;
  firmKey: PropFirmKey;
}): string | null {
  return (
    INVOICE_SENDER_BY_ACCOUNT[params.accountId] ??
    INVOICE_SENDER_BY_FIRM[params.firmKey] ??
    null
  );
}

export class SenderNotReadyError extends Error {}

/** Only an authorised sender can be used, and only ever the one asked for. */
export async function requireActiveSender(emailAddress: string): Promise<EmailSender> {
  const sender = await db.getEmailSenderByAddress(emailAddress);
  if (!sender) {
    throw new SenderNotReadyError(
      `${emailAddress} is not set up as a sender yet.`
    );
  }
  if (sender.status !== "Active" || !sender.refreshTokenEnc) {
    throw new SenderNotReadyError(
      sender.status === "Invited"
        ? `${emailAddress} has been invited but has not authorised yet.`
        : `${emailAddress} needs re-authorising (${sender.status}).` +
          (sender.lastError ? ` Last error: ${sender.lastError}` : "")
    );
  }
  return sender;
}

/**
 * Sends as a named mailbox. Dispatches on the row's provider so the Microsoft
 * senders can be added without touching any caller.
 */
export async function sendAs(
  emailAddress: string,
  message: Omit<BuildMessageInput, "from">
): Promise<{ messageId: string; threadId: string | null }> {
  const sender = await requireActiveSender(emailAddress);

  if (sender.provider === "google") {
    return sendAsGoogleSender(sender, message);
  }

  throw new SenderNotReadyError(
    `Sending as a ${sender.provider} mailbox is not wired up yet — ` +
      `${emailAddress} is hosted on Microsoft 365, which needs the Graph integration.`
  );
}

/** Scopes a sender is expected to hold, for showing setup state in the UI. */
export function expectedScopes(provider: "google" | "microsoft"): string[] {
  return provider === "google" ? GOOGLE_MAIL_SCOPES : ["Mail.Send"];
}
