import { beforeEach, describe, expect, it } from "vitest";
import {
  formatTrpcError,
  resetUnknownProcedureCounts,
  unknownProcedureProbes,
} from "./trpcErrorLog";

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
    const line = formatTrpcError(
      {
        code: "INTERNAL_SERVER_ERROR",
        message: "boom",
        cause: new Error("MetaCopier GET /x failed with 429"),
      },
      "trading.getPnLSummary",
      "query"
    );

    expect(line).toContain("query trading.getPnLSummary failed");
    expect(line).toContain("INTERNAL_SERVER_ERROR boom");
    expect(line).toContain("cause: MetaCopier GET /x failed with 429");
  });

  it("reports an unknown path once, then counts it", () => {
    const first = formatTrpcError(notFound("settings.ai"), "settings.ai", "query");
    expect(first).toContain("no such procedure");
    expect(first).toContain("external probe");

    // The next 998 are silent.
    for (let i = 2; i < 1000; i++) {
      expect(
        formatTrpcError(notFound("settings.ai"), "settings.ai", "query")
      ).toBeNull();
    }
    // The thousandth reports the running total, so it is never truly silent.
    expect(
      formatTrpcError(notFound("settings.ai"), "settings.ai", "query")
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
        formatTrpcError(real, "admin.sendWalletPayment", "mutation")
      ).toContain("NOT_FOUND Trader not found");
    }
    expect(unknownProcedureProbes()).toEqual({});
  });
});
