/**
 * Data for the admin Copy Flow Map: every MetaCopier account as a node and
 * every copier as an edge, with the settings the map shows. Built from ~1 +
 * 3×accounts + 2×copiers MetaCopier calls, so it is cached for a minute and
 * fetched with a small concurrency cap to stay clear of 429s.
 */
import { metaCopierService } from "./metacopier";
import {
  FEATURE_DAILY_PROFIT_TARGET,
  FEATURE_MAXIMUM_LOT,
  FEATURE_MAX_OPEN_POSITIONS,
  FEATURE_NEWS_FILTER,
  FEATURE_SKIP_POSITION,
  FEATURE_TRADE_GUARDRAILS,
} from "./tradingControls";

const FEATURE_MAX_LOT_SIZE = 19;
const CACHE_TTL_MS = 60_000;
const CONCURRENCY = 4;

export interface FlowNode {
  id: string;
  alias: string;
  login: string;
  server: string;
  type: string;
  env: string | null;
  status: string;
  labels: string[];
  connected: boolean;
  balance: number | null;
  equity: number | null;
  openPositions: number;
  countCopier: number;
  tradingDisabled: boolean;
  guardrails: { maxLots: number; aggregate: boolean; enabled: boolean } | null;
  maxOpenPositions: number | null;
  dailyProfitPct: number | null;
  riskLimits: Array<{ type: string; active: boolean; pct: number; abs: number }>;
}

export interface FlowEdge {
  id: string;
  from: string;
  to: string;
  active: boolean;
  monitorOnly: boolean;
  scaleType: string;
  multiplier: number;
  fixedLotSize: number;
  customMagic: number | null;
  copyMagic: boolean;
  copySL: boolean;
  copyTP: boolean;
  reverse: boolean;
  created: string;
  maximumLot: number;
  maxOpenPositions: number;
  maxLotSize: number;
  skipNoSlTp: boolean;
  newsFilter: boolean;
}

export interface FlowMap {
  generatedAt: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
}

let cache: { at: number; data: FlowMap } | null = null;
let inflight: Promise<FlowMap> | null = null;

async function mapLimited<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    })
  );
  return out;
}

const SCALE_NAMES: Record<number, string> = { 1: "Balance", 2: "Equity", 3: "Fixed lot", 4: "No scaling" };

async function build(): Promise<FlowMap> {
  const accounts = await metaCopierService.getAllAccounts();

  const nodes = await mapLimited(accounts, async (a: any): Promise<FlowNode> => {
    const info = a.accountInformation ?? {};
    const [features, limits] = await Promise.all([
      metaCopierService.getAccountFeatures(a.id),
      metaCopierService.getAccountRiskLimits(a.id),
    ]);
    const setting = (typeId: number) => features.find((f: any) => f?.type?.id === typeId)?.setting;
    const g = setting(FEATURE_TRADE_GUARDRAILS);
    return {
      id: a.id,
      alias: a.alias ?? "",
      login: String(a.loginAccountNumber ?? ""),
      server: a.loginServer ?? "",
      type: a.type?.name ?? "",
      env: info.environment ?? null,
      status: a.status?.name ?? "",
      labels: a.labels ?? [],
      connected: !!info.connected,
      balance: info.balance ?? null,
      equity: info.equity ?? null,
      openPositions: info.openPositionsCount ?? 0,
      countCopier: a.countCopier ?? 0,
      tradingDisabled: !!a.tradingDisabled,
      guardrails: g
        ? { maxLots: Number(g.maxLotSizeThreshold ?? 0), aggregate: !!g.aggregatePerSymbol, enabled: !!g.enabled }
        : null,
      maxOpenPositions: setting(FEATURE_MAX_OPEN_POSITIONS)?.maxOpenPositions ?? null,
      dailyProfitPct: setting(FEATURE_DAILY_PROFIT_TARGET)?.dailyProfitTarget ?? null,
      riskLimits: (limits ?? []).map((l: any) => ({
        type: l.riskType?.name ?? "",
        active: !!l.active,
        pct: Number(l.riskLimit ?? 0),
        abs: Number(l.absoluteRiskLimit ?? 0),
      })),
    };
  });

  const withCopiers = accounts.filter((a: any) => a.countCopier > 0);
  const edgeLists = await mapLimited(withCopiers, async (a: any): Promise<FlowEdge[]> => {
    const copiers = await metaCopierService.getCopiersByAccount(a.id);
    return mapLimited(copiers, async (c: any): Promise<FlowEdge> => {
      const cf = await metaCopierService.getCopierFeatures(a.id, c.id);
      const setting = (typeId: number) => cf.find((f: any) => f?.type?.id === typeId)?.setting;
      const st: number = c.scaleType?.id ?? c.scaleType;
      return {
        id: c.id,
        from: c.fromAccountId,
        to: a.id,
        active: !!c.active,
        monitorOnly: !!c.monitorOnly,
        scaleType: SCALE_NAMES[st] ?? String(st),
        multiplier: Number(c.multiplier ?? 1),
        fixedLotSize: Number(c.fixedLotSize ?? 0),
        customMagic: c.customMagicNumber ?? null,
        copyMagic: !!c.copyMagicNumber,
        copySL: !!c.copyStopLoss,
        copyTP: !!c.copyTakeProfit,
        reverse: !!c.reverse,
        created: c.created ?? "",
        maximumLot: Number(setting(FEATURE_MAXIMUM_LOT)?.maximumLot ?? c.maximumLot ?? 0),
        maxOpenPositions: Number(setting(FEATURE_MAX_OPEN_POSITIONS)?.maxOpenPositions ?? c.maxOpenPositions ?? 0),
        maxLotSize: Number(setting(FEATURE_MAX_LOT_SIZE)?.maxLotSize ?? c.maxLotSize ?? 0),
        skipNoSlTp: !!setting(FEATURE_SKIP_POSITION),
        newsFilter: !!setting(FEATURE_NEWS_FILTER)?.enableNewsFilter,
      };
    });
  });

  return { generatedAt: new Date().toISOString(), nodes, edges: edgeLists.flat() };
}

/** The map, at most a minute old; concurrent callers share one build. */
export function getCopyFlowMap(force = false): Promise<FlowMap> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return Promise.resolve(cache.data);
  if (!inflight) {
    inflight = build()
      .then(data => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
