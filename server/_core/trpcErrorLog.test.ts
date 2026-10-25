import { beforeEach, describe, expect, it } from "vitest";
import {
  formatTrpcError,
  resetUnknownProcedureCounts,
  unknownProcedureProbes,
} from "./trpcErrorLog";
import { WalletBusyError } from "../walletErrors";

// The point of the tRPC error log is that a failing procedure can never again
// be invisible, so the one thing these must guarantee is that filtering probe
// noise never filters a real failure.

beforeEach(() => {
  resetUnknownProcedureCounts();
});

const notFound = (path: string) => ({
  code: "NOT_FOUND",
  message: `No procedure found on path "${path}"`,
});

describe("tRPC error log", () => {
  it("logs a real failure in full, with its cause", () => {
    const entry = formatTrpcError(
      {
        code: "INTERNAL_SERVER_ERROR",
        message: "boom",
        cause: new Error("MetaCopier GET /x failed with 429"),
      },
      "trading.getPnLSummary",
      "query"
    );

    expect(entry?.level).toBe("error");
    expect(entry?.line).toContain("query trading.getPnLSummary failed");
    expect(entry?.line).toContain("INTERNAL_SERVER_ERROR boom");
    expect(entry?.line).toContain("cause: MetaCopier GET /x failed with 429");
  });

  it("reports an unknown path once, then counts it", () => {
    const first = formatTrpcError(notFound("settings.ai"), "settings.ai", "query");
    expect(first?.line).toContain("no such procedure");
    expect(first?.line).toContain("external probe");

    // The next 998 are silent.
    for (let i = 2; i < 1000; i++) {
      expect(
        formatTrpcError(notFound("settings.ai"), "settings.ai", "query")
      ).toBeNull();
    }
    // The thousandth reports the running total, so it is never truly silent.
    expect(
      formatTrpcError(notFound("settings.ai"), "settings.ai", "query")?.line
    ).toContain("1000 probes so far");
  });

  it("counts each unknown path separately, including the empty one", () => {
    formatTrpcError(notFound(""), "", "query");
    formatTrpcError(notFound(""), undefined, "query");
    formatTrpcError(notFound("settings.ai"), "settings.ai", "query");

    expect(unknownProcedureProbes()).toEqual({
      "<empty>": 2,
      "settings.ai": 1,
    });
  });

  it("never suppresses a NOT_FOUND raised by a procedure that does exist", () => {
    // A real procedure answering "not found" — e.g. no such trader — must be
    // logged every time, however often it happens.
    const real = { code: "NOT_FOUND", message: "Trader not found" };
    for (let i = 0; i < 5; i++) {
      expect(
        formatTrpcError(real, "admin.sendWalletPayment", "mutation")?.line
      ).toContain("NOT_FOUND Trader not found");
    }
    expect(unknownProcedureProbes()).toEqual({});
  });

  describe("a busy wallet is not a failure", () => {
    const busy = () => ({
      code: "TOO_MANY_REQUESTS",
      message: "GasFree is still settling this wallet's previous payout.",
      cause: new WalletBusyError(
        "GasFree is still settling this wallet's previous payout."
      ),
    });

    it("logs it at warn, not error", () => {
      expect(
        formatTrpcError(busy(), "admin.processProfitSharePayout", "mutation")
          ?.level
      ).toBe("warn");
    });

    it("does not call it a failure", () => {
      // The whole point: grepping the console for errors after a payout run
      // that worked must not turn this up.
      const line = formatTrpcError(
        busy(),
        "admin.processProfitSharePayout",
        "mutation"
      )!.line;
      expect(line).not.toContain("failed");
      expect(line).toContain("declined for now");
      expect(line).toContain("asked to retry");
      expect(line).toContain("admin.processProfitSharePayout");
    });

    it("still says it every time — it is never counted away", () => {
      for (let i = 0; i < 5; i++) {
        expect(
          formatTrpcError(busy(), "admin.processProfitSharePayout", "mutation")
        ).not.toBeNull();
      }
    });

    it("leaves the brute-force caps loud, though they share the code", () => {
      // Demoting every TOO_MANY_REQUESTS would have turned the console record
      // of a brute-force attempt down to warn. These have no WalletBusyError
      // cause, so they stay errors.
      for (const message of [
        "Too many login attempts. Try again in 15 minutes.",
        "Too many verification attempts. Request a new code and try again.",
        "Too many reset requests. Try again in 15 minutes.",
      ]) {
        const entry = formatTrpcError(
          { code: "TOO_MANY_REQUESTS", message },
          "auth.loginWithMagicNumber",
          "mutation"
        );
        expect(entry?.level).toBe("error");
        expect(entry?.line).toContain("failed: TOO_MANY_REQUESTS");
      }
    });

    it("is not fooled by a message that merely mentions a busy wallet", () => {
      // Keyed on the typed cause, not the wording — a real failure whose text
      // happens to talk about pending transfers is still a failure.
      const entry = formatTrpcError(
        {
          code: "INTERNAL_SERVER_ERROR",
          message: "Transfer failed — too many pending transfers, no funds sent",
        },
        "admin.processProfitSharePayout",
        "mutation"
      );
      expect(entry?.level).toBe("error");
      expect(entry?.line).toContain("failed:");
    });
  });
});
