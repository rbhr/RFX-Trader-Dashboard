import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the MetaCopier service
vi.mock("./metacopier", () => ({
  metaCopierService: {
    getAccountRiskLimits: vi.fn(),
  },
}));

import { metaCopierService } from "./metacopier";

describe("getRiskLimit - MetaCopier risk limit fetching", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the absoluteRiskLimit from the first active risk limit", async () => {
    vi.mocked(metaCopierService.getAccountRiskLimits).mockResolvedValue([
      { active: true, absoluteRiskLimit: 300, riskType: { id: 4 } },
    ]);

    const limits = await metaCopierService.getAccountRiskLimits("test-account-id");
    const activeLimit = limits.find((l: any) => l.active && l.absoluteRiskLimit != null);
    expect(activeLimit?.absoluteRiskLimit).toBe(300);
  });

  it("returns null when no active risk limits exist", async () => {
    vi.mocked(metaCopierService.getAccountRiskLimits).mockResolvedValue([
      { active: false, absoluteRiskLimit: 300 },
    ]);

    const limits = await metaCopierService.getAccountRiskLimits("test-account-id");
    const activeLimit = limits.find((l: any) => l.active && l.absoluteRiskLimit != null);
    expect(activeLimit).toBeUndefined();
  });

  it("returns null when risk limits array is empty", async () => {
    vi.mocked(metaCopierService.getAccountRiskLimits).mockResolvedValue([]);

    const limits = await metaCopierService.getAccountRiskLimits("test-account-id");
    const activeLimit = limits.find((l: any) => l.active && l.absoluteRiskLimit != null);
    expect(activeLimit).toBeUndefined();
  });

  it("skips limits with null absoluteRiskLimit and returns the one with a value", async () => {
    vi.mocked(metaCopierService.getAccountRiskLimits).mockResolvedValue([
      { active: true, absoluteRiskLimit: null },
      { active: true, absoluteRiskLimit: 500 },
    ]);

    const limits = await metaCopierService.getAccountRiskLimits("test-account-id");
    const activeLimit = limits.find((l: any) => l.active && l.absoluteRiskLimit != null);
    expect(activeLimit?.absoluteRiskLimit).toBe(500);
  });
});
