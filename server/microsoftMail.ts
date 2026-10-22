import axios from "axios";
import { ENV } from "./_core/env";
import { decryptToken, encryptToken } from "./emailTokenCrypto";
import * as db from "./db";
import type { MailAddress, OutgoingMessage } from "./mime";
import type { EmailSender } from "../drizzle/schema";

/**
 * Sending mail as a real person's Microsoft 365 mailbox, via Graph.
 *
 * Delegated `Mail.Send` only — the grant can send as that one mailbox and
 * cannot read, search or delete anything in it. Deliberately not the
 * application-permission flow, which would give this server the ability to send
 * as *every* mailbox in the tenant and is the usual way a small integration
 * ends up with far more authority than the job needs.
 *
 * Unlike the Google path this does not post raw MIME. Graph accepts MIME, but
 * only the JSON form takes `saveToSentItems`, and a copy in the sender's Sent
 * folder is a requirement here rather than a nicety — an invoice that the
 * sender has no record of having sent is worse than no invoice.
 */

const GRAPH_SEND = "https://graph.microsoft.com/v1.0/me/sendMail";

/** The scope that actually lets us send. The rest is identity and refresh. */
export const MS_SEND_SCOPE = "https://graph.microsoft.com/Mail.Send";

export const MS_MAIL_SCOPES = [
  "openid",
  "email",
  "profile",
  "offline_access",
  MS_SEND_SCOPE,
];

const REFRESH_SKEW_MS = 2 * 60_000;

export class MicrosoftMailNotConfiguredError extends Error {}
export class MicrosoftMailAuthError extends Error {}

function tenant(): string {
  // "common" lets any work tenant (and personal Microsoft accounts) consent,
  // which keeps secureg.net, rfx.capital and rftrust.co on one app
  // registration. Set MS_MAIL_TENANT to a tenant id to lock it down to one.
  return ENV.msMailTenant || "common";
}

export function microsoftMailRedirectUri(): string {
  return `${ENV.publicBaseUrl}/api/email-oauth/microsoft/callback`;
}

export function isMicrosoftMailConfigured(): boolean {
  return Boolean(ENV.msMailClientId && ENV.msMailClientSecret && ENV.publicBaseUrl);
}

function requireConfig(): void {
  if (!isMicrosoftMailConfigured()) {
    throw new MicrosoftMailNotConfiguredError(
      "Microsoft mail sending is not configured. Set MS_MAIL_CLIENT_ID, " +
        "MS_MAIL_CLIENT_SECRET and PUBLIC_BASE_URL."
    );
  }
}

/**
 * Whether a grant can actually send.
 *
 * Graph returns granted scopes as short names (`Mail.Send`), not the full URI
 * that was requested, so a naive comparison against the request always fails.
 * Both forms are accepted here.
 */
export function grantCanSend(scope: string | null | undefined): boolean {
  if (!scope) return false;
  return scope
    .split(/\s+/)
    .some(s => s === MS_SEND_SCOPE || s.toLowerCase() === "mail.send");
}

export function buildMicrosoftAuthUrl(params: {
  state: string;
  loginHint: string;
}): string {
  requireConfig();
  const url = new URL(
    `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize`
  );
  url.searchParams.set("client_id", ENV.msMailClientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", microsoftMailRedirectUri());
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MS_MAIL_SCOPES.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("login_hint", params.loginHint);
  // Force the consent screen, so a re-invite genuinely re-consents rather than
  // silently reusing an older, narrower grant.
  url.searchParams.set("prompt", "consent");
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
 * The mailbox inside an id_token. Not signature-verified, and does not need to
 * be: it came straight back from the token endpoint over TLS in response to our
 * own client-authenticated request. It is never accepted from a redirect.
 *
 * Work accounts put the address in `preferred_username`; `email` is often
 * absent, and `upn` is the older spelling.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  const parts = idToken.split(".");
  if (parts.length < 2) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const candidate = p?.email ?? p?.preferred_username ?? p?.upn;
    return typeof candidate === "string" ? candidate.toLowerCase() : null;
  } catch {
    return null;
  }
}

function describeTokenError(error: any): string {
  const d = error?.response?.data;
  if (d?.error_description) return String(d.error_description).split(/\r?\n/)[0];
  if (d?.error) return String(d.error);
  return error?.message ?? "unknown error";
}

export async function exchangeMicrosoftCode(code: string): Promise<{
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
      `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
      new URLSearchParams({
        code,
        client_id: ENV.msMailClientId,
        client_secret: ENV.msMailClientSecret,
        redirect_uri: microsoftMailRedirectUri(),
        grant_type: "authorization_code",
        scope: MS_MAIL_SCOPES.join(" "),
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 }
    );
    data = response.data;
  } catch (error: any) {
    throw new MicrosoftMailAuthError(
      `Microsoft rejected the authorisation: ${describeTokenError(error)}`
    );
  }

  if (!data.refresh_token) {
    // Means offline_access was not granted, so the grant would die within the
    // hour. Better to refuse it than to store something that stops working.
    throw new MicrosoftMailAuthError(
      "Microsoft returned no refresh token, so this grant would expire within the hour. " +
        "The app registration needs the offline_access permission."
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

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  expiresAt: Date;
  refreshToken: string | null;
}> {
  requireConfig();
  try {
    const response = await axios.post<TokenResponse>(
      `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`,
      new URLSearchParams({
        refresh_token: refreshToken,
        client_id: ENV.msMailClientId,
        client_secret: ENV.msMailClientSecret,
        grant_type: "refresh_token",
        scope: MS_MAIL_SCOPES.join(" "),
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 20_000 }
    );
    return {
      accessToken: response.data.access_token,
      expiresAt: new Date(Date.now() + (response.data.expires_in ?? 3600) * 1000),
      // Microsoft rotates the refresh token on use, unlike Google. Dropping the
      // new one would leave us refreshing with a token that eventually stops
      // being accepted.
      refreshToken: response.data.refresh_token ?? null,
    };
  } catch (error: any) {
    const detail = describeTokenError(error);
    const code = error?.response?.data?.error;
    if (code === "invalid_grant" || /AADSTS70008|AADSTS50173|AADSTS700082/.test(String(detail))) {
      throw new MicrosoftMailAuthError(
        `The mailbox's authorisation is no longer valid (${detail}). It needs re-authorising.`
      );
    }
    throw new Error(`Could not refresh the Microsoft access token: ${detail}`);
  }
}

async function getAccessToken(sender: EmailSender): Promise<string> {
  const cached = sender.accessTokenEnc;
  const expiresAt = sender.accessTokenExpiresAt;
  if (cached && expiresAt && expiresAt.getTime() - Date.now() > REFRESH_SKEW_MS) {
    try {
      return decryptToken(cached);
    } catch {
      // Key rotated or row corrupted — mint a new one below.
    }
  }

  if (!sender.refreshTokenEnc) {
    throw new MicrosoftMailAuthError(
      `${sender.emailAddress} has not completed authorisation yet.`
    );
  }

  let refreshToken: string;
  try {
    refreshToken = decryptToken(sender.refreshTokenEnc);
  } catch (error: any) {
    throw new MicrosoftMailAuthError(
      `Stored grant for ${sender.emailAddress} could not be decrypted — ` +
        `EMAIL_TOKEN_KEY may have changed. It needs re-authorising. (${error?.message})`
    );
  }

  try {
    const fresh = await refreshAccessToken(refreshToken);
    await db.updateEmailSenderTokens(sender.id, {
      accessTokenEnc: encryptToken(fresh.accessToken),
      accessTokenExpiresAt: fresh.expiresAt,
      refreshTokenEnc: fresh.refreshToken ? encryptToken(fresh.refreshToken) : undefined,
    });
    return fresh.accessToken;
  } catch (error: any) {
    if (error instanceof MicrosoftMailAuthError) {
      await db.markEmailSenderRevoked(sender.id, error.message.slice(0, 500));
    }
    throw error;
  }
}

function graphRecipients(addresses: MailAddress[] | undefined) {
  return (addresses ?? []).map(a => ({
    emailAddress: { address: a.email, ...(a.name ? { name: a.name } : {}) },
  }));
}

/**
 * Sends as the given Microsoft mailbox. `saveToSentItems` is explicit rather
 * than relied on: a copy in the sender's Sent folder is the point.
 */
export async function sendAsMicrosoftSender(
  sender: EmailSender,
  message: OutgoingMessage
): Promise<{ messageId: string; threadId: string | null }> {
  const accessToken = await getAccessToken(sender);

  const body = {
    message: {
      subject: message.subject,
      body: message.html
        ? { contentType: "HTML", content: message.html }
        : { contentType: "Text", content: message.text },
      toRecipients: graphRecipients(message.to),
      ...(message.cc?.length ? { ccRecipients: graphRecipients(message.cc) } : {}),
      ...(message.replyTo
        ? { replyTo: graphRecipients([message.replyTo]) }
        : {}),
      ...(message.attachments?.length
        ? {
            attachments: message.attachments.map(a => ({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: a.filename,
              contentType: a.contentType || "application/octet-stream",
              contentBytes: a.content.toString("base64"),
            })),
          }
        : {}),
    },
    saveToSentItems: true,
  };

  try {
    await axios.post(GRAPH_SEND, body, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 30_000,
    });
    await db.touchEmailSenderUsed(sender.id);
    // Graph's sendMail returns 202 with no body, so there is no id to report.
    // Saying so beats inventing one that cannot be looked up anywhere.
    return { messageId: "(accepted by Microsoft Graph)", threadId: null };
  } catch (error: any) {
    const status = error?.response?.status;
    const detail =
      error?.response?.data?.error?.message ?? error?.message ?? "unknown error";
    if (status === 401 || status === 403) {
      await db.markEmailSenderRevoked(sender.id, String(detail).slice(0, 500));
      throw new MicrosoftMailAuthError(
        `Graph refused the send for ${sender.emailAddress}: ${detail}. It needs re-authorising.`
      );
    }
    throw new Error(`Microsoft Graph could not send the message: ${detail}`);
  }
}
