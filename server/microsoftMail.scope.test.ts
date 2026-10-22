import { describe, expect, it } from "vitest";
import { grantCanSend, MS_SEND_SCOPE, MS_MAIL_SCOPES } from "./microsoftMail";

/**
 * Graph hands back granted scopes as short names — "Mail.Send" — not the full
 * URI that was requested. Comparing against the request would therefore reject
 * every valid grant, so both spellings have to be accepted. Same trap as the
 * Google side, opposite direction.
 */

describe("microsoft grantCanSend", () => {
  it("accepts the short name Graph actually returns", () => {
    expect(grantCanSend("openid profile email Mail.Send")).toBe(true);
  });

  it("accepts the full URI we requested", () => {
    expect(grantCanSend(MS_MAIL_SCOPES.join(" "))).toBe(true);
  });

  it("is case-insensitive, since Graph's casing is not guaranteed", () => {
    expect(grantCanSend("mail.send")).toBe(true);
    expect(grantCanSend("MAIL.SEND")).toBe(true);
  });

  it("rejects an identity-only grant", () => {
    expect(grantCanSend("openid profile email offline_access")).toBe(false);
  });

  it("rejects a read scope that is not send", () => {
    expect(grantCanSend("Mail.Read")).toBe(false);
    expect(grantCanSend("Mail.ReadWrite")).toBe(false);
    expect(grantCanSend("https://graph.microsoft.com/Mail.Read")).toBe(false);
  });

  it("is not fooled by a longer scope that merely starts the same", () => {
    expect(grantCanSend("Mail.Send.Shared")).toBe(false);
  });

  it("rejects an absent or empty scope rather than assuming the best", () => {
    expect(grantCanSend(null)).toBe(false);
    expect(grantCanSend(undefined)).toBe(false);
    expect(grantCanSend("")).toBe(false);
  });

  it("requests send and offline_access in the first place", () => {
    expect(MS_MAIL_SCOPES).toContain(MS_SEND_SCOPE);
    // Without offline_access there is no refresh token and the grant dies
    // within the hour.
    expect(MS_MAIL_SCOPES).toContain("offline_access");
  });
});
