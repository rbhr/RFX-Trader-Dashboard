import crypto from "crypto";

/**
 * RFC 5322 message construction, for handing to Gmail's API (and later to
 * Microsoft Graph, which takes the same bytes).
 *
 * Hand-rolled rather than pulled from a dependency because all we need is one
 * well-formed message and the failure mode of a mail library is a transitive
 * dependency tree on a host that holds custodial keys. The parts that actually
 * bite are all handled here: CRLF line endings (a bare LF makes some servers
 * treat the body as headers), RFC 2047 encoding for non-ASCII headers, base64
 * wrapped at 76 columns, and header injection via a newline in a display name.
 */

export interface MailAttachment {
  filename: string;
  /** MIME type, e.g. "application/pdf". */
  contentType: string;
  content: Buffer;
}

export interface MailAddress {
  email: string;
  name?: string | null;
}

export interface BuildMessageInput {
  from: MailAddress;
  to: MailAddress[];
  cc?: MailAddress[];
  replyTo?: MailAddress | null;
  subject: string;
  text: string;
  html?: string | null;
  attachments?: MailAttachment[];
}

const CRLF = "\r\n";

/**
 * Strips CR and LF from a header value. Without this, a display name holding a
 * newline would end the header and let the rest be read as more headers — the
 * classic way a Bcc gets added to somebody else's mail.
 */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/** True when the string is printable US-ASCII and needs no encoding. */
function isPlainAscii(value: string): boolean {
  return /^[\x20-\x7E]*$/.test(value);
}

/** RFC 2047 encoded-word, so "Señor" in a subject does not arrive as mojibake. */
function encodeHeaderWord(value: string): string {
  if (isPlainAscii(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function formatAddress(addr: MailAddress): string {
  const email = sanitizeHeaderValue(addr.email);
  const name = addr.name ? sanitizeHeaderValue(addr.name) : "";
  if (!name) return email;
  // A quoted-string cannot hold a bare quote or backslash; an encoded-word
  // must not be quoted at all, or clients display the encoding verbatim.
  if (isPlainAscii(name)) {
    return `"${name.replace(/[\\"]/g, "")}" <${email}>`;
  }
  return `${encodeHeaderWord(name)} <${email}>`;
}

/** Base64, wrapped at 76 characters per line as the MIME spec requires. */
function base64Lines(buf: Buffer): string {
  const b64 = buf.toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

function boundary(): string {
  return `=_rfx_${crypto.randomBytes(12).toString("hex")}`;
}

/** Quotes a filename for Content-Disposition, encoding it if non-ASCII. */
function contentDispositionFilename(filename: string): string {
  const clean = sanitizeHeaderValue(filename).replace(/[\\"]/g, "");
  if (isPlainAscii(clean)) return `filename="${clean}"`;
  // RFC 2231, which is what clients actually honour for non-ASCII filenames.
  return `filename*=UTF-8''${encodeURIComponent(clean)}`;
}

/**
 * Builds the full message. Structure follows what is actually present:
 *
 *   text only                    -> text/plain
 *   text + html                  -> multipart/alternative
 *   (either) + attachments       -> multipart/mixed wrapping the above
 *
 * Sending multipart/alternative only when there is a genuine alternative
 * matters: a single-part alternative is legal but some clients render it as an
 * empty message.
 */
export function buildMimeMessage(input: BuildMessageInput): string {
  const headers: string[] = [
    `From: ${formatAddress(input.from)}`,
    `To: ${input.to.map(formatAddress).join(", ")}`,
  ];
  if (input.cc?.length) headers.push(`Cc: ${input.cc.map(formatAddress).join(", ")}`);
  if (input.replyTo) headers.push(`Reply-To: ${formatAddress(input.replyTo)}`);
  headers.push(`Subject: ${encodeHeaderWord(sanitizeHeaderValue(input.subject))}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push("MIME-Version: 1.0");

  const attachments = input.attachments ?? [];

  const bodyPart = (): string => {
    const textPart =
      `Content-Type: text/plain; charset="UTF-8"${CRLF}` +
      `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      base64Lines(Buffer.from(input.text, "utf8"));

    if (!input.html) return textPart;

    const altBoundary = boundary();
    const htmlPart =
      `Content-Type: text/html; charset="UTF-8"${CRLF}` +
      `Content-Transfer-Encoding: base64${CRLF}${CRLF}` +
      base64Lines(Buffer.from(input.html, "utf8"));

    return (
      `Content-Type: multipart/alternative; boundary="${altBoundary}"${CRLF}${CRLF}` +
      `--${altBoundary}${CRLF}${textPart}${CRLF}` +
      `--${altBoundary}${CRLF}${htmlPart}${CRLF}` +
      `--${altBoundary}--`
    );
  };

  if (!attachments.length) {
    const body = bodyPart();
    // bodyPart() emits its own Content-Type, which belongs in the top-level
    // header block when there is no enclosing multipart.
    return headers.join(CRLF) + CRLF + body + CRLF;
  }

  const mixedBoundary = boundary();
  const parts = [
    `--${mixedBoundary}${CRLF}${bodyPart()}`,
    ...attachments.map(att => {
      const type = sanitizeHeaderValue(att.contentType) || "application/octet-stream";
      return (
        `--${mixedBoundary}${CRLF}` +
        `Content-Type: ${type}; name="${sanitizeHeaderValue(att.filename).replace(/[\\"]/g, "")}"${CRLF}` +
        `Content-Transfer-Encoding: base64${CRLF}` +
        `Content-Disposition: attachment; ${contentDispositionFilename(att.filename)}${CRLF}${CRLF}` +
        base64Lines(att.content)
      );
    }),
  ];

  return (
    headers.join(CRLF) +
    CRLF +
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"${CRLF}${CRLF}` +
    parts.join(CRLF) +
    CRLF +
    `--${mixedBoundary}--${CRLF}`
  );
}

/** Gmail's API takes the raw message base64url-encoded, unpadded. */
export function toGmailRaw(message: string): string {
  return Buffer.from(message, "utf8").toString("base64url");
}
