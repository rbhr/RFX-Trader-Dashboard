import type { Express, Request, Response } from "express";
import * as db from "./db";
import { encryptToken, verifyInviteSignature } from "./emailTokenCrypto";
import {
  buildGoogleAuthUrl,
  exchangeGoogleCode,
  grantCanSend,
  revokeGoogleToken,
  GoogleMailAuthError,
  GoogleMailNotConfiguredError,
  isGoogleMailConfigured,
} from "./googleMail";
import { logEvent } from "./logStore";

/**
 * The mailbox-authorisation flow.
 *
 * These routes are deliberately outside the admin session. The person giving
 * consent is the owner of the mailbox — someone whose personal Gmail we want to
 * send invoices from — and they have no login on this app and never will. So
 * the authority has to travel in the link itself: a single-use nonce, HMAC
 * signed, with an expiry, handed to one named address.
 *
 * What that buys an attacker who guesses a link is nothing useful. They can
 * only attach *their own* Google account to the invite, and the callback
 * rejects a mailbox that is not the invited one, so the worst case is a
 * burned invite.
 */

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteTtlMs(): number {
  return INVITE_TTL_MS;
}

function page(title: string, body: string): string {
  // Self-contained: the consenting person is not an app user and should not be
  // dropped into the dashboard shell or asked to log in to anything.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0;
         min-height: 100vh; display: grid; place-items: center; padding: 24px;
         background: #f6f7f9; color: #14161a; }
  @media (prefers-color-scheme: dark) { body { background: #0e1013; color: #e8eaed; } }
  .card { max-width: 30rem; width: 100%; background: #fff; border-radius: 12px;
          padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,.12); }
  @media (prefers-color-scheme: dark) { .card { background: #1a1d22; } }
  h1 { font-size: 1.25rem; margin: 0 0 12px; }
  p { line-height: 1.55; margin: 0 0 12px; }
  code { background: rgba(127,127,127,.15); padding: 1px 5px; border-radius: 4px; }
  .ok { color: #15803d; } .bad { color: #b91c1c; }
  @media (prefers-color-scheme: dark) { .ok { color: #4ade80; } .bad { color: #f87171; } }
</style></head>
<body><div class="card">${body}</div></body></html>`;
}

function sendPage(res: Response, status: number, title: string, body: string): void {
  res.status(status).type("html").send(page(title, body));
}

function getParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

export function registerEmailOauthRoutes(app: Express) {
  /**
   * Opened by the mailbox owner. Validates the invite, then bounces to Google.
   * The nonce is not spent here — only on a completed callback — so a link
   * closed at Google's consent screen can still be used.
   */
  app.get("/api/email-oauth/google/start", async (req: Request, res: Response) => {
    const nonce = getParam(req, "n");
    const signature = getParam(req, "s");

    if (!nonce || !signature || !verifyInviteSignature(nonce, signature)) {
      sendPage(
        res,
        400,
        "Link not valid",
        `<h1 class="bad">This link isn't valid</h1>
         <p>Ask for a fresh authorisation link.</p>`
      );
      return;
    }

    try {
      const sender = await db.getEmailSenderByNonce(nonce);
      if (!sender || !sender.inviteExpiresAt) {
        sendPage(
          res,
          410,
          "Link already used",
          `<h1 class="bad">This link has already been used</h1>
           <p>Each authorisation link works once. Ask for a new one.</p>`
        );
        return;
      }
      if (sender.inviteExpiresAt.getTime() < Date.now()) {
        sendPage(
          res,
          410,
          "Link expired",
          `<h1 class="bad">This link has expired</h1>
           <p>Ask for a fresh authorisation link.</p>`
        );
        return;
      }

      if (!isGoogleMailConfigured()) {
        sendPage(
          res,
          503,
          "Not configured",
          `<h1 class="bad">Not set up yet</h1>
           <p>Mail sending isn't configured on the server. Nothing you did caused this.</p>`
        );
        return;
      }

      // State carries the same signed nonce, which is what ties Google's
      // redirect back to this specific invite.
      const state = `${nonce}.${signature}`;
      res.redirect(
        buildGoogleAuthUrl({ state, loginHint: sender.emailAddress })
      );
    } catch (error: any) {
      console.error("[EmailOAuth] start failed:", error?.message ?? error);
      sendPage(
        res,
        500,
        "Something went wrong",
        `<h1 class="bad">Something went wrong</h1><p>Please ask for a new link.</p>`
      );
    }
  });

  /** Google's redirect. Exchanges the code and stores the grant. */
  app.get("/api/email-oauth/google/callback", async (req: Request, res: Response) => {
    const code = getParam(req, "code");
    const state = getParam(req, "state");
    const oauthError = getParam(req, "error");

    if (oauthError) {
      sendPage(
        res,
        400,
        "Authorisation cancelled",
        `<h1>Authorisation cancelled</h1>
         <p>Nothing was changed. You can use the link again if you'd like to allow it.</p>`
      );
      return;
    }

    const [nonce, signature] = (state ?? "").split(".");
    if (!code || !nonce || !signature || !verifyInviteSignature(nonce, signature)) {
      sendPage(
        res,
        400,
        "Link not valid",
        `<h1 class="bad">This link isn't valid</h1><p>Ask for a fresh authorisation link.</p>`
      );
      return;
    }

    try {
      const sender = await db.getEmailSenderByNonce(nonce);
      if (!sender || !sender.inviteExpiresAt || sender.inviteExpiresAt.getTime() < Date.now()) {
        sendPage(
          res,
          410,
          "Link expired",
          `<h1 class="bad">This link has expired or was already used</h1>
           <p>Ask for a fresh authorisation link.</p>`
        );
        return;
      }

      const grant = await exchangeGoogleCode(code);

      // The invite named one mailbox. login_hint only suggests, so somebody
      // signed into several Google accounts can easily consent as the wrong
      // one — and silently storing that would mean invoices going out over a
      // different person's name. Refuse rather than guess.
      if (grant.email && grant.email !== sender.emailAddress.toLowerCase()) {
        logEvent(
          "email",
          `Mail authorisation refused: link for ${sender.emailAddress} was consented ` +
            `by ${grant.email}`,
          "warn"
        );
        sendPage(
          res,
          400,
          "Wrong Google account",
          `<h1 class="bad">That's a different Google account</h1>
           <p>This link authorises <code>${sender.emailAddress}</code>, but you signed in as
              <code>${grant.email}</code>.</p>
           <p>Switch accounts and open the link again. Nothing was saved.</p>`
        );
        return;
      }

      // Google does not refuse a scope it will not grant — it returns a token
      // with that scope quietly missing. Storing such a grant as working means
      // the first real send fails with "insufficient authentication scopes"
      // long after anyone remembers which box went unticked.
      if (!grantCanSend(grant.scope)) {
        await revokeGoogleToken(grant.refreshToken);
        const reason =
          "Authorisation completed without permission to send mail " +
          `(granted: ${grant.scope ?? "nothing"}). The Gmail permission was not allowed.`;
        await db.noteEmailSenderInviteProblem(sender.id, reason);
        logEvent("email", `Mail authorisation refused for ${sender.emailAddress}: ${reason}`, "warn");
        sendPage(
          res,
          400,
          "One permission still needed",
          `<h1 class="bad">Almost — one permission is missing</h1>
           <p>Google didn't include permission to <strong>send email</strong>, so RFX still
              can't send on your behalf.</p>
           <p>Please open the same link again. On the permissions step, make sure the box for
              <em>"Send email on your behalf"</em> is <strong>ticked</strong> before continuing —
              Google leaves it unticked by default and lets you carry on without it.</p>
           <p>Nothing was saved, and the partial permission has been handed back.</p>`
        );
        return;
      }

      await db.activateEmailSender({
        id: sender.id,
        refreshTokenEnc: encryptToken(grant.refreshToken),
        accessTokenEnc: encryptToken(grant.accessToken),
        accessTokenExpiresAt: grant.expiresAt,
        scope: grant.scope,
      });

      logEvent(
        "email",
        `Mail sending authorised for ${sender.emailAddress} (scope: ${grant.scope ?? "unknown"})`
      );

      sendPage(
        res,
        200,
        "Authorised",
        `<h1 class="ok">Thank you — that's done</h1>
         <p>RFX can now send invoice emails from <code>${sender.emailAddress}</code>.</p>
         <p>Those emails will appear in your Sent folder, and any replies come
            straight back to you.</p>
         <p>This permission lets RFX send mail only. It cannot read, search or
            delete anything in your mailbox. You can withdraw it at any time in
            your Google account's security settings.</p>`
      );
    } catch (error: any) {
      const detail = error?.message ?? String(error);
      console.error("[EmailOAuth] callback failed:", detail);
      logEvent("email", `Mail authorisation failed: ${detail}`, "error");

      const expected =
        error instanceof GoogleMailAuthError ||
        error instanceof GoogleMailNotConfiguredError;
      sendPage(
        res,
        expected ? 400 : 500,
        "Authorisation failed",
        `<h1 class="bad">That didn't work</h1>
         <p>${expected ? detail : "Something went wrong on our side."}</p>
         <p>Nothing was saved. Please ask for a new link.</p>`
      );
    }
  });
}
