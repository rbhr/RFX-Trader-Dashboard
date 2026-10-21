import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The demo copier is created only so MetaCopier hands back the source
 * account's short id, which becomes the trader's magic number. It must never
 * copy a trade onto the demo master — which previously meant disabling it and
 * stripping its skip-position filter by hand after every trader edit.
 *
 * A live copier is the opposite: active, and with that filter on. Both shapes
 * come out of the same createCopier call, so both are pinned here.
 */

const state = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; url: string; data: any }>,
}));

vi.mock("axios", () => ({
  default: vi.fn(async (cfg: any) => {
    state.calls.push({
      method: cfg.method ?? "GET",
      url: cfg.url,
      data: cfg.data,
    });
    // POST /copiers → the created copier; features list → empty.
    if (cfg.url.endsWith("/copiers") && cfg.method === "POST") {
      return { data: { id: "copier-1", fromAccountShortId: 51123 } };
    }
    if (cfg.url.includes("/features") && (cfg.method ?? "GET") === "GET") {
      return { data: [] };
    }
    if (cfg.url.includes("/copiers/copier-1") && (cfg.method ?? "GET") === "GET") {
      return { data: { id: "copier-1", active: true } };
    }
    return { data: {} };
  }),
}));

process.env.METACOPIER_API_KEY = "test-key";

const { metaCopierService } = await import("./metacopier");

const featurePosts = () =>
  state.calls.filter(c => c.url.includes("/features") && c.method === "POST");
const copierPuts = () =>
  state.calls.filter(c => c.url.includes("/copiers/copier-1") && c.method === "PUT");

beforeEach(() => {
  state.calls = [];
});

describe("createCopier", () => {
  it("creates the demo copier disabled and without the skip-position filter", async () => {
    const result = await metaCopierService.createCopier({
      fromAccountId: "trader-account",
      toAccountId: "demo-master",
      status: "DISABLED",
      skipPositionFeature: false,
    });

    // The magic number is the whole point of the call.
    expect(result.success).toBe(true);
    expect(result.fromAccountShortId).toBe(51123);

    // Nothing was copied onto the demo master: disabled, and no filter added.
    expect(featurePosts()).toEqual([]);
    const put = copierPuts().at(-1);
    expect(put?.data.active).toBe(false);
    expect(put?.data.monitorOnly).toBe(false);
    expect(put?.data.customMagicNumber).toBe(51123);
  });

  it("still gives a live copier the skip-position filter, active", async () => {
    await metaCopierService.createCopier({
      fromAccountId: "trader-account",
      toAccountId: "live-master",
    });

    const posts = featurePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].data.type.id).toBe(31);
    expect(posts[0].data.setting).toMatchObject({
      ifSlNotDefined: true,
      ifTpNotDefined: true,
    });

    const put = copierPuts().at(-1);
    expect(put?.data.active).toBe(true);
  });
});
