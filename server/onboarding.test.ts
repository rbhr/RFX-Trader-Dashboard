import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcrypt";

vi.mock("./db", () => ({
  getMagicNumberById: vi.fn(),
  updateMagicNumber: vi.fn(),
}));
vi.mock("./metacopier", () => ({
  enableTraderLiveCopiers: vi.fn(),
}));
vi.mock("./telegram", () => ({
  sendTelegramMessage: vi.fn(),
}));

import { getMagicNumberById, updateMagicNumber } from "./db";
import { enableTraderLiveCopiers } from "./metacopier";
import { sendTelegramMessage } from "./telegram";
import { maybeActivateOnboarding, buildLoginDetailsMessage } from "./onboarding";

// A fully-onboarded trader (all gate conditions satisfied). `password` is a
// bcrypt hash of something OTHER than the magic number (i.e. changed default).
async function fullyOnboarded(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    magicNumber: "81297",
    name: "Richard",
    mtAccount: "260973989",
    mtPassword: "RFX2026-Richard",
    mtServer: "Exness-MT5Trial15",
    showMyTradesUrl: null,
    telegramHandle: "@CyberSoftwareGuy",
    telegramChatId: "8700343736",
    mcAccountId: "mc-123",
    usdtAddress: "TXxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    usdtNetwork: "TRC20",
    isActive: true,
    liveCopiersActivatedAt: null,
    password: await bcrypt.hash("a-new-password", 4),
    ...overrides,
  };
}

describe("maybeActivateOnboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(enableTraderLiveCopiers).mockResolvedValue({ enabled: 1, skipped: false });
  });

  it("activates once when all conditions are met (enable + stamp + send)", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue((await fullyOnboarded()) as any);

    await maybeActivateOnboarding(1);

    expect(enableTraderLiveCopiers).toHaveBeenCalledTimes(1);
    expect(updateMagicNumber).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ liveCopiersActivatedAt: expect.any(Date) })
    );
    expect(sendTelegramMessage).toHaveBeenCalledTimes(1);
    const [, msg] = vi.mocked(sendTelegramMessage).mock.calls[0];
    expect(msg).toContain("LOGIN DETAILS");
  });

  it("is a no-op if already activated (one-way)", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue(
      (await fullyOnboarded({ liveCopiersActivatedAt: new Date() })) as any
    );

    await maybeActivateOnboarding(1);

    expect(enableTraderLiveCopiers).not.toHaveBeenCalled();
    expect(updateMagicNumber).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });

  it("skips when Telegram not linked", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue(
      (await fullyOnboarded({ telegramChatId: null })) as any
    );
    await maybeActivateOnboarding(1);
    expect(enableTraderLiveCopiers).not.toHaveBeenCalled();
    expect(updateMagicNumber).not.toHaveBeenCalled();
  });

  it("skips when USDT address or network missing", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue(
      (await fullyOnboarded({ usdtAddress: null })) as any
    );
    await maybeActivateOnboarding(1);
    expect(enableTraderLiveCopiers).not.toHaveBeenCalled();
  });

  it("skips when password is still the default (== magic number)", async () => {
    const t = await fullyOnboarded();
    t.password = await bcrypt.hash(t.magicNumber, 4); // default password
    vi.mocked(getMagicNumberById).mockResolvedValue(t as any);
    await maybeActivateOnboarding(1);
    expect(enableTraderLiveCopiers).not.toHaveBeenCalled();
  });

  it("skips when trader is inactive", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue(
      (await fullyOnboarded({ isActive: false })) as any
    );
    await maybeActivateOnboarding(1);
    expect(enableTraderLiveCopiers).not.toHaveBeenCalled();
  });

  it("skips when no MetaCopier account", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue(
      (await fullyOnboarded({ mcAccountId: null })) as any
    );
    await maybeActivateOnboarding(1);
    expect(enableTraderLiveCopiers).not.toHaveBeenCalled();
  });

  it("does NOT stamp the flag if enabling copiers throws (retried next time)", async () => {
    vi.mocked(getMagicNumberById).mockResolvedValue((await fullyOnboarded()) as any);
    vi.mocked(enableTraderLiveCopiers).mockRejectedValue(new Error("MetaCopier down"));

    await maybeActivateOnboarding(1);

    expect(updateMagicNumber).not.toHaveBeenCalled();
    expect(sendTelegramMessage).not.toHaveBeenCalled();
  });
});

describe("buildLoginDetailsMessage", () => {
  it("omits the ShowMyTrades line when no URL", async () => {
    const msg = buildLoginDetailsMessage((await fullyOnboarded()) as any);
    expect(msg).toContain("🔐 <b>LOGIN DETAILS</b>");
    expect(msg).toContain("<pre>");
    expect(msg).toContain("RFX - Richard - 81297");
    expect(msg).not.toContain("ShowMyTrades");
  });

  it("includes and HTML-escapes the ShowMyTrades URL when present", async () => {
    const msg = buildLoginDetailsMessage(
      (await fullyOnboarded({ showMyTradesUrl: "https://smt.example/r?a=1&b=2" })) as any
    );
    expect(msg).toContain("ShowMyTrades");
    expect(msg).toContain("a=1&amp;b=2");
  });
});
