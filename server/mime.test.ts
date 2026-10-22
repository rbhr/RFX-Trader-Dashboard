import { describe, expect, it } from "vitest";
import { buildMimeMessage, formatAddress, toGmailRaw } from "./mime";

/**
 * The failure mode of a hand-built MIME message is mail that silently arrives
 * blank, mangled, or carrying headers somebody else chose. Each of those is
 * pinned here.
 */

const base = {
  from: { email: "helen.m.cooper@gmail.com", name: "Helen Cooper" },
  to: [{ email: "accounts@example.com" }],
  subject: "Invoice 0001",
  text: "Please find the invoice attached.",
};

/** Headers are everything before the first blank line. */
const headerBlock = (msg: string) => msg.split("\r\n\r\n")[0];

describe("formatAddress", () => {
  it("leaves a bare address alone", () => {
    expect(formatAddress({ email: "a@b.com" })).toBe("a@b.com");
  });

  it("quotes a display name", () => {
    expect(formatAddress({ email: "a@b.com", name: "Helen Cooper" })).toBe(
      '"Helen Cooper" <a@b.com>'
    );
  });

  it("encodes a non-ASCII name instead of quoting it", () => {
    // A quoted encoded-word is displayed verbatim by clients, so it must not
    // be wrapped in quotes.
    const out = formatAddress({ email: "a@b.com", name: "Renée Søren" });
    expect(out).toMatch(/^=\?UTF-8\?B\?[A-Za-z0-9+/=]+\?= <a@b\.com>$/);
    expect(out).not.toContain('"');
  });

  it("flattens a newline in a display name, so it cannot start a new header", () => {
    const out = formatAddress({
      email: "a@b.com",
      name: "Helen\r\nBcc: attacker@evil.com",
    });
    // The text survives inside the quoted name, which is harmless. What must
    // not survive is the line break that would end the header.
    expect(out).not.toContain("\n");
    expect(out).not.toContain("\r");
    expect(out).toBe('"Helen Bcc: attacker@evil.com" <a@b.com>');
  });

  it("strips a stray quote that would end the quoted-string early", () => {
    expect(formatAddress({ email: "a@b.com", name: 'He"llen' })).toBe(
      '"Hellen" <a@b.com>'
    );
  });
});

describe("buildMimeMessage — headers", () => {
  const msg = buildMimeMessage(base);

  it("uses CRLF line endings throughout", () => {
    // A bare LF makes some servers read the body as continued headers.
    expect(msg).not.toMatch(/(?<!\r)\n/);
  });

  it("sets From, To and Subject", () => {
    const h = headerBlock(msg);
    expect(h).toContain('From: "Helen Cooper" <helen.m.cooper@gmail.com>');
    expect(h).toContain("To: accounts@example.com");
    expect(h).toContain("Subject: Invoice 0001");
    expect(h).toContain("MIME-Version: 1.0");
  });

  it("joins several recipients with commas", () => {
    const h = headerBlock(
      buildMimeMessage({
        ...base,
        to: [{ email: "a@x.com" }, { email: "b@x.com", name: "Bee" }],
      })
    );
    expect(h).toContain('To: a@x.com, "Bee" <b@x.com>');
  });

  it("includes Cc and Reply-To only when given", () => {
    expect(headerBlock(msg)).not.toContain("Cc:");
    expect(headerBlock(msg)).not.toContain("Reply-To:");
    const withBoth = headerBlock(
      buildMimeMessage({
        ...base,
        cc: [{ email: "cc@x.com" }],
        replyTo: { email: "reply@x.com" },
      })
    );
    expect(withBoth).toContain("Cc: cc@x.com");
    expect(withBoth).toContain("Reply-To: reply@x.com");
  });

  it("encodes a non-ASCII subject", () => {
    const h = headerBlock(buildMimeMessage({ ...base, subject: "Facturación €500" }));
    expect(h).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
  });

  it("flattens a newline in the subject, so no second header is created", () => {
    const h = headerBlock(
      buildMimeMessage({ ...base, subject: "Hi\r\nBcc: attacker@evil.com" })
    );
    // "Bcc:" inside the Subject value is just text. The property that matters
    // is that no *line* begins with it.
    const injected = h.split("\r\n").filter(l => /^bcc:/i.test(l));
    expect(injected).toEqual([]);
    expect(h).toContain("Subject: Hi Bcc: attacker@evil.com");
  });

  it("creates no second header from a newline in a recipient name either", () => {
    const h = headerBlock(
      buildMimeMessage({
        ...base,
        to: [{ email: "a@x.com", name: "Bee\r\nBcc: attacker@evil.com" }],
      })
    );
    expect(h.split("\r\n").filter(l => /^bcc:/i.test(l))).toEqual([]);
  });
});

describe("buildMimeMessage — body structure", () => {
  it("is a single text/plain part when there is no html and no attachment", () => {
    const msg = buildMimeMessage(base);
    expect(msg).toContain('Content-Type: text/plain; charset="UTF-8"');
    // A single-part multipart/alternative renders empty in some clients.
    expect(msg).not.toContain("multipart/alternative");
    expect(msg).not.toContain("multipart/mixed");
  });

  it("round-trips the text body through base64", () => {
    const msg = buildMimeMessage(base);
    const body = msg.split("\r\n\r\n").slice(1).join("\r\n\r\n");
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe(base.text);
  });

  it("uses multipart/alternative for text plus html, text first", () => {
    const msg = buildMimeMessage({ ...base, html: "<p>Hello</p>" });
    expect(msg).toContain("multipart/alternative");
    expect(msg.indexOf("text/plain")).toBeLessThan(msg.indexOf("text/html"));
  });

  it("closes every multipart boundary it opens", () => {
    const msg = buildMimeMessage({
      ...base,
      html: "<p>Hello</p>",
      attachments: [
        { filename: "invoice.pdf", contentType: "application/pdf", content: Buffer.from("%PDF-1.4") },
      ],
    });
    const boundaries = [...msg.matchAll(/boundary="([^"]+)"/g)].map(m => m[1]);
    expect(boundaries.length).toBe(2); // mixed + alternative
    for (const b of boundaries) {
      expect(msg).toContain(`--${b}--`);
    }
  });

  it("wraps attachment base64 at 76 columns", () => {
    const content = Buffer.alloc(1000, 0x41);
    const msg = buildMimeMessage({
      ...base,
      attachments: [{ filename: "a.bin", contentType: "application/octet-stream", content }],
    });
    const longLines = msg.split("\r\n").filter(l => l.length > 76 && !l.includes(":"));
    expect(longLines).toEqual([]);
  });

  it("round-trips attachment bytes", () => {
    const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe]);
    const msg = buildMimeMessage({
      ...base,
      attachments: [{ filename: "invoice.pdf", contentType: "application/pdf", content }],
    });
    const after = msg.slice(msg.indexOf("Content-Disposition: attachment"));
    const b64 = after.split("\r\n\r\n")[1].split("\r\n--")[0].replace(/\r\n/g, "");
    expect(Buffer.from(b64, "base64").equals(content)).toBe(true);
  });

  it("uses RFC 2231 for a non-ASCII attachment filename", () => {
    const msg = buildMimeMessage({
      ...base,
      attachments: [
        { filename: "facturación.pdf", contentType: "application/pdf", content: Buffer.from("x") },
      ],
    });
    expect(msg).toContain("filename*=UTF-8''");
  });

  it("falls back to a generic content type rather than emitting none", () => {
    const msg = buildMimeMessage({
      ...base,
      attachments: [{ filename: "a", contentType: "", content: Buffer.from("x") }],
    });
    expect(msg).toContain("application/octet-stream");
  });
});

describe("toGmailRaw", () => {
  it("is base64url with no padding and no characters Gmail rejects", () => {
    const raw = toGmailRaw(buildMimeMessage(base));
    expect(raw).not.toMatch(/[+/=]/);
    expect(Buffer.from(raw, "base64url").toString("utf8")).toContain("Subject: Invoice 0001");
  });
});
