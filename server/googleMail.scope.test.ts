import { describe, expect, it } from "vitest";
import { grantCanSend, GMAIL_SEND_SCOPE, GOOGLE_MAIL_SCOPES } from "./googleMail";

/**
 * Google does not refuse a scope it will not grant — it returns a token with
 * that scope quietly missing. A grant stored without checking looks healthy and
 * then fails on first use with "Request had insufficient authentication
 * scopes", which is exactly what happened to richard@rundledust.com: Google
 * returned "https://www.googleapis.com/auth/userinfo.email openid" and nothing
 * else. These pin the check that now refuses such a grant at authorisation.
 */

describe("grantCanSend", () => {
  it("accepts a grant that includes the send scope", () => {
    expect(grantCanSend(GOOGLE_MAIL_SCOPES.join(" "))).toBe(true);
  });

  it("rejects the identity-only grant Google actually returned", () => {
    expect(grantCanSend("https://www.googleapis.com/auth/userinfo.email openid")).toBe(false);
  });

  it("rejects an absent or empty scope rather than assuming the best", () => {
    expect(grantCanSend(null)).toBe(false);
    expect(grantCanSend(undefined)).toBe(false);
    expect(grantCanSend("")).toBe(false);
    expect(grantCanSend("   ")).toBe(false);
  });

  it("is not fooled by a scope that merely contains the string", () => {
    // A read scope whose name starts the same way must not count as send.
    expect(grantCanSend("https://www.googleapis.com/auth/gmail.send.readonly")).toBe(false);
    expect(grantCanSend("https://www.googleapis.com/auth/gmail.readonly")).toBe(false);
  });

  it("finds the scope wherever it sits in the list", () => {
    expect(grantCanSend(`${GMAIL_SEND_SCOPE} openid`)).toBe(true);
    expect(grantCanSend(`openid ${GMAIL_SEND_SCOPE}`)).toBe(true);
    expect(grantCanSend(`openid ${GMAIL_SEND_SCOPE} email`)).toBe(true);
  });

  it("tolerates the irregular whitespace a scope string can arrive with", () => {
    expect(grantCanSend(`  openid   ${GMAIL_SEND_SCOPE}  `)).toBe(true);
    expect(grantCanSend(`openid\t${GMAIL_SEND_SCOPE}\nemail`)).toBe(true);
  });

  it("requests the send scope in the first place", () => {
    expect(GOOGLE_MAIL_SCOPES).toContain(GMAIL_SEND_SCOPE);
  });
});
