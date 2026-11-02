import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

import { USDT_ADDRESS_COOL_OFF_HOURS } from "@shared/const";
import {
  addressHoldReason,
  addressHoldUntil,
  assertAddressSettled,
} from "./payoutAddressHold";

/**
 * This hold is the only thing that makes swap-send-restore impossible rather
 * than merely noisy, so what matters is narrow and absolute: a fresh address
 * cannot be paid, an address that has never moved can, and the hold expires on
 * its own. A hold that failed open would hand the money back to the attack.
 */

const HOURS = 60 * 60 * 1000;
const now = new Date("2026-11-02T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * HOURS);

describe("addressHoldUntil", () => {
  it("does not hold a row whose address has never moved", () => {
    expect(addressHoldUntil({ usdtAddressUpdatedAt: null }, now)).toBeNull();
    expect(addressHoldUntil({}, now)).toBeNull();
  });

  it("holds an address that changed a moment ago", () => {
    const until = addressHoldUntil({ usdtAddressUpdatedAt: ago(0.01) }, now);
    expect(until).not.toBeNull();
    expect(until!.getTime() - ago(0.01).getTime()).toBe(
      USDT_ADDRESS_COOL_OFF_HOURS * HOURS
    );
  });

  it("releases the moment the cool-off has fully elapsed", () => {
    const justInside = ago(USDT_ADDRESS_COOL_OFF_HOURS - 0.01);
    const exactly = ago(USDT_ADDRESS_COOL_OFF_HOURS);
    const past = ago(USDT_ADDRESS_COOL_OFF_HOURS + 0.01);

    expect(addressHoldUntil({ usdtAddressUpdatedAt: justInside }, now)).not.toBeNull();
    expect(addressHoldUntil({ usdtAddressUpdatedAt: exactly }, now)).toBeNull();
    expect(addressHoldUntil({ usdtAddressUpdatedAt: past }, now)).toBeNull();
  });

  it("holds a timestamp in the future rather than treating it as expired", () => {
    const skewed = new Date(now.getTime() + 1 * HOURS);
    expect(addressHoldUntil({ usdtAddressUpdatedAt: skewed }, now)).not.toBeNull();
  });
});

describe("assertAddressSettled", () => {
  it("passes a trader whose address has not moved", () => {
    expect(() =>
      assertAddressSettled({ name: "Ali", usdtAddressUpdatedAt: null }, now)
    ).not.toThrow();
  });

  it("passes a trader whose change has aged out", () => {
    expect(() =>
      assertAddressSettled(
        { name: "Ali", usdtAddressUpdatedAt: ago(USDT_ADDRESS_COOL_OFF_HOURS + 1) },
        now
      )
    ).not.toThrow();
  });

  it("refuses a payout to a freshly-changed address, as a CONFLICT", () => {
    let thrown: unknown;
    try {
      assertAddressSettled(
        { name: "Ali", usdtAddressUpdatedAt: ago(0.5) },
        now
      );
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    // CONFLICT is what the payout-cycle waiting period throws, so the admin UI
    // already reads it as "not yet due" rather than as a failed send.
    expect((thrown as TRPCError).code).toBe("CONFLICT");
    // The message has to name the trader and when the hold lifts, or the admin
    // cannot tell a hold from a broken payout.
    expect((thrown as TRPCError).message).toContain("Ali");
    expect((thrown as TRPCError).message).toContain("2026-11-02 15:30 UTC");
  });
});

describe("addressHoldReason", () => {
  it("is null when nothing is held", () => {
    expect(addressHoldReason({ usdtAddressUpdatedAt: null }, now)).toBeNull();
  });

  it("quotes the release time for the payout candidate list", () => {
    expect(addressHoldReason({ usdtAddressUpdatedAt: ago(1) }, now)).toBe(
      "Address changed — held until 2026-11-02 15:00 UTC"
    );
  });
});
