import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";

import { USDT_ADDRESS_COOL_OFF_HOURS } from "@shared/const";
import {
  addressHoldUntil,
  assertPayoutSettled,
  payoutHoldReason,
  payoutHoldUntil,
  telegramHoldUntil,
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

describe("assertPayoutSettled", () => {
  it("passes a trader whose address has not moved", () => {
    expect(() =>
      assertPayoutSettled({ name: "Ali", usdtAddressUpdatedAt: null }, now)
    ).not.toThrow();
  });

  it("passes a trader whose change has aged out", () => {
    expect(() =>
      assertPayoutSettled(
        { name: "Ali", usdtAddressUpdatedAt: ago(USDT_ADDRESS_COOL_OFF_HOURS + 1) },
        now
      )
    ).not.toThrow();
  });

  it("refuses a payout to a freshly-changed address, as a CONFLICT", () => {
    let thrown: unknown;
    try {
      assertPayoutSettled(
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

describe("payoutHoldReason", () => {
  it("is null when nothing is held", () => {
    expect(payoutHoldReason({ usdtAddressUpdatedAt: null }, now)).toBeNull();
  });

  it("quotes the release time for the payout candidate list", () => {
    expect(payoutHoldReason({ usdtAddressUpdatedAt: ago(1) }, now)).toBe(
      "Address changed — held until 2026-11-02 15:00 UTC"
    );
  });
});

/**
 * Telegram is where the code authorising an address change is delivered, so
 * whoever holds that chat holds the destination. An attacker who moved it
 * would satisfy the 2FA added in 4.14.0 rather than be stopped by it — the
 * 2 November attack rebuilt out of the parts meant to prevent it. Hence the
 * same cool-off on moving the channel as on moving the address.
 */
describe("telegramHoldUntil", () => {
  it("does not hold an account whose Telegram has never moved", () => {
    expect(telegramHoldUntil({ telegramChangedAt: null }, now)).toBeNull();
    expect(telegramHoldUntil({}, now)).toBeNull();
  });

  it("holds for the same cool-off as an address change", () => {
    const until = telegramHoldUntil({ telegramChangedAt: ago(1) }, now);
    expect(until).not.toBeNull();
    expect(until!.getTime() - ago(1).getTime()).toBe(
      USDT_ADDRESS_COOL_OFF_HOURS * HOURS
    );
  });

  it("releases once the cool-off has elapsed", () => {
    expect(
      telegramHoldUntil(
        { telegramChangedAt: ago(USDT_ADDRESS_COOL_OFF_HOURS) },
        now
      )
    ).toBeNull();
  });
});

describe("the two holds together", () => {
  it("takes the later of the two when both are in force", () => {
    const hold = payoutHoldUntil(
      { usdtAddressUpdatedAt: ago(3), telegramChangedAt: ago(1) },
      now
    );
    // The Telegram move is the more recent, so it is what the trader waits on.
    expect(hold).toEqual(
      new Date(ago(1).getTime() + USDT_ADDRESS_COOL_OFF_HOURS * HOURS)
    );
  });

  it("ignores a hold that has already expired", () => {
    const hold = payoutHoldUntil(
      {
        usdtAddressUpdatedAt: ago(1),
        telegramChangedAt: ago(USDT_ADDRESS_COOL_OFF_HOURS + 1),
      },
      now
    );
    expect(hold).toEqual(
      new Date(ago(1).getTime() + USDT_ADDRESS_COOL_OFF_HOURS * HOURS)
    );
  });

  it("names which change is holding the payout", () => {
    expect(payoutHoldReason({ telegramChangedAt: ago(1) }, now)).toBe(
      "Telegram moved — held until 2026-11-02 15:00 UTC"
    );
    expect(payoutHoldReason({ usdtAddressUpdatedAt: ago(1) }, now)).toBe(
      "Address changed — held until 2026-11-02 15:00 UTC"
    );
  });

  it("refuses the payout, saying which move caused the hold", () => {
    let thrown: unknown;
    try {
      assertPayoutSettled({ name: "Ali", telegramChangedAt: ago(0.5) }, now);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(TRPCError);
    expect((thrown as TRPCError).code).toBe("CONFLICT");
    expect((thrown as TRPCError).message).toContain("Telegram account was moved");
    expect((thrown as TRPCError).message).toContain("Ali");
  });

  it("passes a trader with neither change", () => {
    expect(() =>
      assertPayoutSettled(
        { name: "Ali", usdtAddressUpdatedAt: null, telegramChangedAt: null },
        now
      )
    ).not.toThrow();
  });
});
