import axios from "axios";
import { ENV } from "./_core/env";
import { decryptToken, encryptToken } from "./emailTokenCrypto";
import * as db from "./db";
import { buildMimeMessage, toGmailRaw, type BuildMessageInput } from "./mime";
import type { EmailSender } from "../drizzle/schema";

/**
 * Sending mail as a real person's Google mailbox.
 *
 * Done with plain HTTP rather than the `googleapis` package: the three calls we
 * need (authorise, exchange/refresh, send) are each a single request, and the
 * SDK brings a large dependency tree onto a host that holds custodial wallet
 * keys. Nothing here needs a dependency that is not already installed.
 *
 * The scope is `gmail.send` and nothing more. That grant can send mail and
 * cannot read, list or delete a single message, which is the difference between
 * asking somebody for permission to send on their behalf and asking for their
 * mailbox. It also means the app cannot read replies — replies land in the
 * sender's own inbox, which is what we want for invoices.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const SEND_ENDPOINT = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

/** The scope that actually lets us send. Everything else here is identity. */
export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";

/** `openid email` identifies which mailbox consented; gmail.send does the work. */
export const GOOGLE_MAIL_SCOPES = ["openid", "email", GMAIL_SEND_SCOPE];

/**
 * Whether a grant can actually send.
 *
 * Google does not refuse a scope it will not grant — it returns a token with
 * that scope quietly missing. So a consent screen where the Gmail permission
 * was left unticked, or a project where the scope was never configured,
 * produces a perfectly valid token that fails on first use with
 * "Request had insufficient authentication scopes". Checking at authorisation
 * time is the difference between telling somebody to tick a box and handing
 * them an opaque failure days later.
 */
export function grantCanSend(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope.split(/\s+/).includes(GMAIL_SEND_SCOPE);
}

/**
 * Hands a grant back to Google. Used when we refuse one for missing scopes:
 * leaving an authorisation on somebody's account that we have declined to use
 * is untidy at best and confusing at worst when they review their permissions.
 */
export async function revokeGoogleToken(token: string): Promise<void> {
  try {
    await axios.post(
      "https://oauth2.googleapis.com/revoke",
      new URLSearchParams({ token }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10_000 }
    );
  } catch {
    // Best effort — the grant is unusable to us either way.
  }
}

/** Refresh this far before expiry, so a send never races the clock. */
const REFRESH_SKEW_MS = 2 * 60_000;

export class GoogleMailNotConfiguredError extends Error {}
/** The grant is gone — the user revoked it, or it was never completed. */
export class GoogleMailAuthError extends Error {}

export function googleMailRedirectUri(): string {
  return `${ENV.publicBaseUrl}/api/email-oauth/google/callback`;
}

export function isGoogleMailConfigured(): boolean {
  return Boolean(
    ENV.googleMailClientId && ENV.googleMailClientSecret && ENV.publicBaseUrl
  );
}

function requireConfig(): void {
  if (!isGoogleMailConfigured()) {
    throw new GoogleMailNotConfiguredError(
      "Google mail sending is not configured. Set GOOGLE_MAIL_CLIENT_ID, " +
        "GOOGLE_MAIL_CLIENT_SECRET and PUBLIC_BASE_URL."
    );
  }
}

/**
 * The URL the sender opens to consent.
 *
 * `access_type=offline` with `prompt=consent` is deliberate: Google only
 * returns a refresh token on a consent screen the user actually interacts with,
 * and re-authorising an address that already consented returns no refresh token
 * at all unless consent is forced. Without this a re-invite silently produces a
 * grant that works for an hour and then dies.
 *
 * `login_hint` preselects the mailbox, which matters when somebody is signed
 * into several Google accounts — but it is only a hint, so the callback still
 * checks which address actually consented.
 */
export function buildGoogleAuthUrl(params: {
  state: string;
  loginHint: string;
}): string {
  requireConfig();
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", ENV.googleMailClientId);
  url.searchParams.set("redirect_uri", googleMailRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_MAIL_SCOPES.join(" "));
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", params.state);
  url.searchParams.set("login_hint", params.loginHint);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
}

/**
 * The email address inside an id_token.
 *
 * The signature is not verified, and does not need to be: the token came
 * straight back from Google's token endpoint over TLS in response to our own
 * client-authenticated request, which is the one case the OIDC spec allows
 * skipping validation. It is never accepted from a redirect or a client.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const email = typeof payload?.email === "string" ? payload.email : null;
    return email ? email.toLowerCase() : null;
  } catch {
    return null;
  }
}

function describeTokenError(error: any): string {
  const data = error?.response?.data;
  if (data?.error_description) return String(data.error_description);
  if (data?.error) return String(data.error);
  return error?.message ?? "unknown error";
}

/**
 * Exchanges the one-time code for a grant, and reports which mailbox consented
 * so the caller can check it is the one that was invited.
 */
export async function exchangeGoogleCode(code: string): Promise<{
  refreshToken: string;
  accessToken: string;
  expiresAt: Date;
  scope: string | null;
  email: string | null;
}> {
  requireConfig();
  let data: TokenResponse;
  try {
    const response = await axios.post<TokenResponse>(
      TOKEN_ENDPOINT,
      new URLSearchParams({
        code,
        client_id: ENV.googleMailClientId,
        client_secret: ENV.googleMailClientSecret,
        redirect_uri: googleMailRedirectUri(),
        grant_type: "authorization_code",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 }
    );
    data = response.data;
  } catch (error: any) {
    throw new GoogleMailAuthError(`Google rejected the authorisation: ${describeTokenError(error)}`);
  }

  if (!data.refresh_token) {
    // Almost always a re-authorisation without prompt=consent, which we always
    // send — so if it happens, say what is missing rather than storing a grant
    // that stops working in an hour.
    throw new GoogleMailAuthError(
      "Google returned no refresh token, so this grant would expire within the hour. " +
        "Revoke the app's access in the Google account's security settings and authorise again."
    );
  }

  return {
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scope: data.scope ?? null,
    email: emailFromIdToken(data.id_token),
  };
}

/** Trades a stored refresh token for a fresh access token. */
async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
}> {
  requireConfig();
  try {
    const response = await axios.post<TokenResponse>(
      TOKEN_ENDPOINT,
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: ENV.googleMailClientId,
        client_secret: ENV.googleMailClientSecret,
        grant_type: "refresh_token",
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 }
    );
    return {
      accessToken: response.data.access_token,
      expiresAt: new Date(Date.now() + (response.data.expires_in ?? 3600) * 1000),
    };
  } catch (error: any) {
    const detail = describeTokenError(error);
    // invalid_grant means the grant is gone for good — revoked by the user,
    // password changed, or the account was deleted. Retrying never helps, so
    // it has to be distinguishable from a network blip by the caller.
    if (String(detail).includes("invalid_grant")) {
      throw new GoogleMailAuthError(
        `The mailbox's authorisation is no longer valid (${detail}). It needs re-authorising.`
      );
    }
    throw new Error(`Could not refresh the Google access token: ${detail}`);
  }
}

/**
 * A usable access token for a sender, refreshing and re-storing if needed.
 * A revoked grant marks the row so the admin screen can show it needs redoing.
 */
async function getAccessToken(sender: EmailSender): Promise<string> {
  const cached = sender.accessTokenEnc;
  const expiresAt = sender.accessTokenExpiresAt;
  if (cached && expiresAt && expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    try {
      return decryptToken(cached);
    } catch {
      // Key rotated or row corrupted — fall through and mint a new one.
    }
  }

  if (!sender.refreshTokenEnc) {
    throw new GoogleMailAuthError(
      `${sender.emailAddress} has not completed authorisation yet.`
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(sender.refreshTokenEnc);
  } catch (error: any) {
    throw new GoogleMailAuthError(
      `Stored grant for ${sender.emailAddress} could not be decrypted — ` +
        `EMAIL_TOKEN_KEY may have changed. It needs re-authorising. (${error?.message})`
    );
  }

  try {
    const fresh = await refreshAccessToken(refreshToken);
    await db.updateEmailSenderAccessToken(
      sender.id,
      encryptToken(fresh.accessToken),
      fresh.expiresAt
    );
    return fresh.accessToken;
  } catch (error: any) {
    if (error instanceof GoogleMailAuthError) {
      await db.markEmailSenderRevoked(sender.id, error.message.slice(0, 500));
    }
    throw error;
  }
}

/**
 * Sends a message as the given sender. The From header is the sender's own
 * address because Gmail will not accept any other — which is the whole point:
 * the mail is genuinely theirs, lands in their Sent folder, and replies go to
 * their inbox rather than to us.
 */
export async function sendAsGoogleSender(
  sender: EmailSender,
  message: Omit<BuildMessageInput, "from">
): Promise<{ messageId: string; threadId: string | null }> {
  const accessToken = await getAccessToken(sender);
  const raw = toGmailRaw(
    buildMimeMessage({
      ...message,
      from: { email: sender.emailAddress, name: sender.displayName },
    })
  );

  try {
    const response = await axios.post<{ id: string; threadId?: string }>(
      SEND_ENDPOINT,
      { raw },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 30_000,
      }
    );
    await db.touchEmailSenderUsed(sender.id);
    return { messageId: response.data.id, threadId: response.data.threadId ?? null };
  } catch (error: any) {
    const status = error?.response?.status;
    const detail =
      error?.response?.data?.error?.message ?? error?.message ?? "unknown error";
    if (status === 401 || status === 403) {
      await db.markEmailSenderRevoked(sender.id, String(detail).slice(0, 500));
      throw new GoogleMailAuthError(
        `Gmail refused the send for ${sender.emailAddress}: ${detail}. It needs re-authorising.`
      );
    }
    throw new Error(`Gmail could not send the message: ${detail}`);
  }
}
