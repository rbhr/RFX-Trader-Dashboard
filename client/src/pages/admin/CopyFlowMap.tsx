import { useEffect, useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";

// The copy flow map: every MetaCopier account as a node, every copier as an
// arrow. Incubators sit left, masters and other live accounts right; select an
// account to see where its trades go, where they come from, and each link's
// copy settings. Styling is its own small token set (the page keeps its look
// through the coming dashboard rework), scoped under .cfm.

type FlowNode = {
  id: string; alias: string; login: string; server: string; type: string; env: string | null;
  status: string; labels: string[]; connected: boolean; balance: number | null; equity: number | null;
  openPositions: number; countCopier: number; tradingDisabled: boolean;
  guardrails: { maxLots: number; aggregate: boolean; enabled: boolean } | null;
  maxOpenPositions: number | null; dailyProfitPct: number | null;
  riskLimits: Array<{ type: string; active: boolean; pct: number; abs: number }>;
};
type FlowEdge = {
  id: string; from: string; to: string; active: boolean; monitorOnly: boolean; scaleType: string;
  multiplier: number; fixedLotSize: number; customMagic: number | null; copyMagic: boolean;
  copySL: boolean; copyTP: boolean; reverse: boolean; created: string;
  maximumLot: number; maxOpenPositions: number; maxLotSize: number; skipNoSlTp: boolean; newsFilter: boolean;
};
type Role = "demo" | "master" | "live" | "routing";
type Node = FlowNode & { role: Role; in: FlowEdge[]; out: FlowEdge[] };
type SimNode = Node & d3.SimulationNodeDatum;
type SimEdge = FlowEdge & { source: SimNode | string; target: SimNode | string };
type EdgeState = "active" | "manage" | "disabled";

const ROUTING_ID = "b94cabc8-946d-4a99-9b81-286f8553cc63";
const ROLE_LABEL: Record<Role, string> = { demo: "incubator (demo)", master: "RFX master", live: "live", routing: "demo routing" };

const css = `
.cfm{
  --bg:#f4f6f9;--panel:#ffffff;--ink:#141a26;--muted:#5b6578;--line:#dfe4ec;--soft:#eef1f6;
  --demo:#d8931a;--live:#0e8f8a;--master:#2f6fed;--routing:#8a6bd1;
  --active:#1a9c6b;--manage:#d9a400;--disabled:#9aa3b2;--danger:#d64545;
  --sel:#2f6fed;--halo:rgba(47,111,237,.18);
  --mono:"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace;
  --sans:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.45;
  display:grid;grid-template-columns:minmax(0,1fr) 400px;grid-template-rows:auto minmax(0,1fr);gap:12px;
  height:calc(100vh - 2rem);min-height:560px;
}
.dark .cfm{
  --bg:#0e1219;--panel:#151b26;--ink:#e6eaf2;--muted:#94a0b5;--line:#26303f;--soft:#1b2230;
  --demo:#e5a634;--live:#2fb6b0;--master:#6d9bff;--routing:#a68df0;
  --active:#33b57f;--manage:#e6b422;--disabled:#5c6678;--danger:#ef6b6b;--sel:#6d9bff;--halo:rgba(109,155,255,.22);
}
.cfm *{box-sizing:border-box}
.cfm header{grid-column:1/-1;display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px}
.cfm h1{font-size:18px;font-weight:600;margin:0;letter-spacing:-.01em}
.cfm .sub{color:var(--muted);font-size:12px}
.cfm .controls{display:flex;flex-wrap:wrap;gap:8px;margin-inline-start:auto;align-items:center}
.cfm input[type=search]{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px;min-width:220px}
.cfm input[type=search]:focus{outline:2px solid var(--sel);outline-offset:1px}
.cfm label.chk{display:inline-flex;gap:6px;align-items:center;color:var(--muted);font-size:12px;cursor:pointer}
.cfm .legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--muted);align-items:center}
.cfm .legend i{display:inline-block;width:10px;height:10px;border-radius:50%;margin-inline-end:5px;vertical-align:-1px}
.cfm .legend .ln{display:inline-block;width:22px;height:0;border-top:2px solid;margin-inline-end:6px;vertical-align:middle}
.cfm .stage{position:relative;background:var(--panel);border:1px solid var(--line);border-radius:12px;overflow:hidden;min-height:360px}
.cfm .stage svg{width:100%;height:100%;display:block;touch-action:none}
.cfm .stage .hint{position:absolute;left:12px;bottom:10px;font-size:11px;color:var(--muted);pointer-events:none}
.cfm .stage .loading{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-size:13px}
.cfm .panel{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;overflow:auto;min-height:0}
.cfm .panel h2{font-size:16px;margin:0 0 2px;font-weight:600;text-wrap:balance}
.cfm .login{font-family:var(--mono);color:var(--muted);font-size:12px}
.cfm .tags{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 12px}
.cfm .tag{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--line);color:var(--muted);letter-spacing:.02em}
.cfm .tag.demo{border-color:var(--demo);color:var(--demo)}.cfm .tag.live{border-color:var(--live);color:var(--live)}
.cfm .tag.master{border-color:var(--master);color:var(--master)}.cfm .tag.routing{border-color:var(--routing);color:var(--routing)}
.cfm .tag.off{border-color:var(--danger);color:var(--danger)}
.cfm .kv{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:13px;margin:0 0 14px}
.cfm .kv dt{color:var(--muted)}.cfm .kv dd{margin:0;font-family:var(--mono);font-variant-numeric:tabular-nums}
.cfm .panel h3{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:16px 0 8px;font-weight:600}
.cfm .flow{display:flex;flex-direction:column;gap:6px}
.cfm .edge{border:1px solid var(--line);border-radius:10px;padding:8px 10px;cursor:pointer;display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:center;background:var(--panel);text-align:left;font:inherit;color:inherit;width:100%}
.cfm .edge:hover,.cfm .edge:focus-visible{border-color:var(--sel);outline:none}
.cfm .edge.on{background:var(--soft);border-color:var(--sel);box-shadow:0 0 0 3px var(--halo)}
.cfm .edge .name{font-weight:500}
.cfm .edge .meta{grid-column:1/-1;font-family:var(--mono);font-size:11.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 10px}
.cfm .state{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;color:#fff;white-space:nowrap}
.cfm .state.active{background:var(--active)}.cfm .state.manage{background:var(--manage);color:#1a1400}.cfm .state.disabled{background:var(--disabled)}
.cfm .edge .lim{font-family:var(--mono);font-size:11.5px;color:var(--ink)}
.cfm .empty{color:var(--muted);font-size:13px}
.cfm .detail{margin-top:8px;border-top:1px solid var(--line);padding-top:10px}
.cfm svg text{font-family:var(--sans);fill:var(--ink);font-size:10.5px;pointer-events:none;paint-order:stroke;stroke:var(--panel);stroke-width:3px;stroke-linejoin:round}
.cfm svg .node circle{cursor:pointer;stroke:var(--panel);stroke-width:1.5px}
.cfm svg .node.sel circle{stroke:var(--sel);stroke-width:3px}
.cfm svg .dim{opacity:.16}
.cfm svg .edge-line{fill:none;stroke-linecap:round}
.cfm svg .edge-hit{fill:none;stroke:transparent;stroke-width:12px;cursor:pointer}
@media (max-width:1100px){.cfm{grid-template-columns:1fr;grid-template-rows:auto minmax(320px,55vh) auto;height:auto}}
@media (prefers-reduced-motion:reduce){.cfm *{transition:none!important}}
`;

const fmt$ = (v: number | null) =>
  v == null ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ratio = (e: FlowEdge) =>
  e.scaleType === "Fixed lot"
    ? `fixed ${e.fixedLotSize.toFixed(2)} lots`
    : e.scaleType === "No scaling"
      ? `${e.multiplier.toFixed(2)}×`
      : `${e.scaleType} scaling ${e.multiplier.toFixed(2)}×`;
const stateOf = (e: FlowEdge): EdgeState => (!e.active ? "disabled" : e.monitorOnly ? "manage" : "active");
const radius = (n: Node) => 7 + Math.sqrt(n.in.length + n.out.length) * 3;
const cssVar = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

export default function CopyFlowMap() {
  const [showOff, setShowOff] = useState(true);
  const [showRouting, setShowRouting] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const simRef = useRef<d3.Simulation<SimNode, SimEdge> | null>(null);
  // Positions persist across re-renders so a filter toggle doesn't re-scatter the map.
  const posRef = useRef(new Map<string, { x: number; y: number }>());
  const utils = trpc.useUtils();
  const { data, isLoading, isFetching, refetch } = trpc.admin.getCopyFlowMap.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const nodes = useMemo<Node[]>(() => {
    if (!data) return [];
    return data.nodes.map(n => ({
      ...n,
      out: data.edges.filter(e => e.from === n.id),
      in: data.edges.filter(e => e.to === n.id),
      role: n.id === ROUTING_ID ? "routing" : n.labels.includes("RFX Master") ? "master" : n.env === "DEMO" ? "demo" : "live",
    }));
  }, [data]);
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const edges = data?.edges ?? [];

  // Default selection: the busiest master, so the first look shows real flow.
  useEffect(() => {
    if (!selected && nodes.length) {
      const first = nodes.filter(n => n.role === "master").sort((a, b) => b.in.length - a.in.length)[0];
      if (first) setSelected(first.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  const select = (id: string) => { setSelected(id); setSelectedEdge(null); };
  const selectEdge = (e: FlowEdge) => { setSelected(e.from); setSelectedEdge(e.id); };

  // ---- the graph
  useEffect(() => {
    const svgEl = svgRef.current, stage = stageRef.current, root = rootRef.current;
    if (!svgEl || !stage || !root || !nodes.length) return;
    const svg = d3.select(svgEl);
    svg.selectAll("*").remove();
    let W = stage.clientWidth, H = stage.clientHeight;
    svg.attr("viewBox", [0, 0, W, H].join(" "));
    const g = svg.append("g");
    const defs = svg.append("defs");
    for (const s of ["active", "manage", "disabled"] as EdgeState[]) {
      defs.append("marker").attr("id", "cfm-arr-" + s).attr("viewBox", "0 -4 8 8").attr("refX", 8).attr("markerWidth", 7).attr("markerHeight", 7).attr("orient", "auto")
        .append("path").attr("d", "M0,-4L8,0L0,4").attr("fill", `var(--${s})`);
    }
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.3, 4]).on("zoom", ev => g.attr("transform", ev.transform)));

    const visEdges: SimEdge[] = edges
      .filter(e => (showOff || e.active) && (showRouting || e.to !== ROUTING_ID))
      .map(e => ({ ...e, source: e.from, target: e.to }));
    const used = new Set<string>();
    visEdges.forEach(e => { used.add(e.from); used.add(e.to); });
    const visNodes: SimNode[] = nodes.filter(n => used.has(n.id)).map(n => ({ ...n, ...(posRef.current.get(n.id) ?? {}) }));

    const anchorX = (n: SimNode) => (n.role === "demo" ? W * 0.22 : n.role === "routing" ? W * 0.5 : W * 0.78);
    const sim = d3.forceSimulation<SimNode, SimEdge>(visNodes)
      .force("link", d3.forceLink<SimNode, SimEdge>(visEdges).id(d => d.id).distance(110).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-260))
      .force("x", d3.forceX<SimNode>(anchorX).strength(0.12))
      .force("y", d3.forceY<SimNode>(H / 2).strength(0.05))
      .force("collide", d3.forceCollide<SimNode>(d => radius(d) + 7));
    simRef.current = sim;

    const link = g.append("g").selectAll("path").data(visEdges).join("path").attr("class", "edge-line")
      .attr("stroke", d => cssVar(root, `--${stateOf(d)}`)).attr("stroke-width", d => (d.active ? 1.8 : 1.2))
      .attr("stroke-dasharray", d => (d.active ? null : "4 4")).attr("marker-end", d => `url(#cfm-arr-${stateOf(d)})`);
    const hit = g.append("g").selectAll("path").data(visEdges).join("path").attr("class", "edge-hit")
      .on("click", (ev, d) => { ev.stopPropagation(); selectEdge(d); });
    const node = g.append("g").selectAll<SVGGElement, SimNode>("g").data(visNodes, d => d.id).join("g").attr("class", "node")
      .call(d3.drag<SVGGElement, SimNode>()
        .on("start", (ev, d) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev, d) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev, d) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }))
      .on("click", (ev, d) => { ev.stopPropagation(); select(d.id); });
    node.append("circle").attr("r", d => radius(d)).attr("fill", d => cssVar(root, `--${d.role}`)).attr("opacity", d => (d.connected ? 1 : 0.55));
    node.append("text").attr("dy", d => -(radius(d) + 3)).attr("text-anchor", "middle")
      .text(d => (d.alias.length > 26 ? d.alias.slice(0, 25) + "…" : d.alias));

    const path = (d: SimEdge) => {
      const s = d.source as SimNode, t = d.target as SimNode;
      const dx = t.x! - s.x!, dy = t.y! - s.y!, L = Math.hypot(dx, dy) || 1, r = radius(t) + 2;
      return `M${s.x},${s.y}A${L * 1.6},${L * 1.6} 0 0,1 ${t.x! - (dx / L) * r},${t.y! - (dy / L) * r}`;
    };
    sim.on("tick", () => {
      link.attr("d", path); hit.attr("d", path);
      node.attr("transform", d => `translate(${d.x},${d.y})`);
      for (const n of visNodes) posRef.current.set(n.id, { x: n.x!, y: n.y! });
    });
    svg.on("click", () => { setSelected(null); setSelectedEdge(null); });

    const ro = new ResizeObserver(() => {
      W = stage.clientWidth; H = stage.clientHeight;
      svg.attr("viewBox", [0, 0, W, H].join(" "));
      sim.force("x", d3.forceX<SimNode>(anchorX).strength(0.12)).force("y", d3.forceY<SimNode>(H / 2).strength(0.05)).alpha(0.3).restart();
    });
    ro.observe(stage);
    return () => { ro.disconnect(); sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, showOff, showRouting]);

  // ---- focus: dim everything not connected to the selection (no re-layout)
  useEffect(() => {
    const svgEl = svgRef.current; if (!svgEl) return;
    const sel = selected ? byId.get(selected) : null;
    const focus = sel ? new Set([sel.id, ...sel.in.map(e => e.from), ...sel.out.map(e => e.to)]) : null;
    d3.select(svgEl).selectAll<SVGGElement, SimNode>("g.node")
      .classed("dim", d => !!focus && !focus.has(d.id)).classed("sel", d => d.id === selected);
    d3.select(svgEl).selectAll<SVGPathElement, SimEdge>("path.edge-line")
      .classed("dim", d => (!!focus && d.from !== selected && d.to !== selected) || (!!selectedEdge && d.id !== selectedEdge))
      .attr("stroke-width", d => (d.id === selectedEdge ? 3.5 : d.active ? 1.8 : 1.2));
  }, [selected, selectedEdge, byId, nodes, edges, showOff, showRouting]);

  const onSearch = (q: string) => {
    setQuery(q);
    const s = q.trim().toLowerCase(); if (!s) return;
    const hit = nodes.find(n => n.alias.toLowerCase().includes(s) || n.login.includes(s) || n.out.some(e => String(e.customMagic ?? "").includes(s)));
    if (hit) select(hit.id);
  };

  const sel = selected ? byId.get(selected) : null;
  const edge = selectedEdge ? edges.find(e => e.id === selectedEdge) : null;

  return (
    <AdminLayout>
      <style>{css}</style>
      <div className="cfm p-4" ref={rootRef}>
        <header>
          <div>
            <h1>Copy Flow Map</h1>
            <div className="sub">
              {data
                ? `${data.nodes.length} accounts · ${data.edges.length} copiers · as of ${new Date(data.generatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
                : "Loading MetaCopier…"}
            </div>
          </div>
          <div className="controls">
            <input type="search" id="cfm-search" placeholder="Find account, login or magic…" aria-label="Find account" value={query} onChange={e => onSearch(e.target.value)} />
            <label className="chk"><input type="checkbox" id="cfm-off" checked={showOff} onChange={e => setShowOff(e.target.checked)} /> show disabled copiers</label>
            <label className="chk"><input type="checkbox" id="cfm-routing" checked={showRouting} onChange={e => setShowRouting(e.target.checked)} /> show demo routing</label>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => utils.admin.getCopyFlowMap.fetch({ refresh: true }).then(() => refetch())}>
              <RefreshCw className={`h-4 w-4 me-2 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
          <div className="legend">
            <span><i style={{ background: "var(--demo)" }} />incubator (demo)</span>
            <span><i style={{ background: "var(--master)" }} />RFX master</span>
            <span><i style={{ background: "var(--live)" }} />other live</span>
            <span><i style={{ background: "var(--routing)" }} />demo routing</span>
            <span><span className="ln" style={{ borderColor: "var(--active)" }} />active</span>
            <span><span className="ln" style={{ borderColor: "var(--manage)" }} />manage only</span>
            <span><span className="ln" style={{ borderColor: "var(--disabled)", borderTopStyle: "dashed" }} />disabled</span>
          </div>
        </header>

        <div className="stage" ref={stageRef}>
          <svg ref={svgRef} role="img" aria-label="Copy flow graph" />
          {isLoading && <div className="loading">Reading every account and copier from MetaCopier…</div>}
          <div className="hint">Click an account or a line · drag to move · scroll to zoom</div>
        </div>

        <aside className="panel">
          {!sel ? (
            <div className="empty">Select an account on the map to see where its trades go, where it copies from, and the copy settings on each link.</div>
          ) : (
            <NodePanel n={sel} byId={byId} showRouting={showRouting} selectedEdge={selectedEdge} onEdge={selectEdge} edge={edge ?? null} />
          )}
        </aside>
      </div>
    </AdminLayout>
  );
}

function NodePanel({ n, byId, showRouting, selectedEdge, onEdge, edge }: {
  n: Node; byId: Map<string, Node>; showRouting: boolean; selectedEdge: string | null; onEdge: (e: FlowEdge) => void; edge: FlowEdge | null;
}) {
  const rl = n.riskLimits.filter(l => l.active);
  const actual = rl.find(l => l.type === "Actual"), daily = rl.find(l => /daily/i.test(l.type));
  const kv: Array<[string, string | number]> = [
    ["Balance", fmt$(n.balance)], ["Equity", fmt$(n.equity)], ["Open positions", n.openPositions],
  ];
  if (n.guardrails) kv.push(["Max lots (account)", `${n.guardrails.maxLots.toFixed(2)}${n.guardrails.aggregate ? " per symbol" : " per trade"}${n.guardrails.enabled ? "" : " (off)"}`]);
  if (n.maxOpenPositions != null) kv.push(["Max open trades", n.maxOpenPositions || "no limit"]);
  if (n.dailyProfitPct) kv.push(["Daily profit limit", `${n.dailyProfitPct}%`]);
  if (daily) kv.push(["Daily loss limit", `${(daily.pct * 100).toFixed(1)}%`]);
  if (actual) kv.push(["Equity stop-out", fmt$(actual.abs) + (actual.pct ? ` (+${(actual.pct * 100).toFixed(1)}%)` : "")]);
  const outs = n.out.filter(e => showRouting || e.to !== ROUTING_ID), ins = n.in;
  return (
    <>
      <h2>{n.alias}</h2>
      <div className="login">{n.login}</div>
      <div className="tags">
        <span className={`tag ${n.role}`}>{ROLE_LABEL[n.role]}</span>
        <span className="tag">{n.type} · {n.server}</span>
        {n.labels.filter(l => l !== "RFX Master").map(l => <span key={l} className="tag">{l}</span>)}
        {!n.connected && <span className="tag off">not connected</span>}
        {n.tradingDisabled && <span className="tag off">trading disabled</span>}
      </div>
      <dl className="kv">{kv.map(([k, v]) => <Row key={k} k={k} v={v} />)}</dl>
      <h3>Copies to ({outs.length})</h3>
      <div className="flow">{outs.length ? outs.map(e => <EdgeCard key={e.id} e={e} other={byId.get(e.to)} dir="to" on={e.id === selectedEdge} onClick={() => onEdge(e)} />) : <div className="empty">Nothing copies out of this account.</div>}</div>
      <h3>Copies from ({ins.length})</h3>
      <div className="flow">{ins.length ? ins.map(e => <EdgeCard key={e.id} e={e} other={byId.get(e.from)} dir="from" on={e.id === selectedEdge} onClick={() => onEdge(e)} />) : <div className="empty">Nothing copies into this account.</div>}</div>
      {edge && <EdgeDetail e={edge} byId={byId} />}
    </>
  );
}

function Row({ k, v }: { k: string; v: string | number }) {
  return (<><dt>{k}</dt><dd>{v}</dd></>);
}

function EdgeCard({ e, other, dir, on, onClick }: { e: FlowEdge; other?: Node; dir: "to" | "from"; on: boolean; onClick: () => void }) {
  const st = stateOf(e);
  const lim = [e.maximumLot ? `max ${e.maximumLot.toFixed(2)} lots` : null, e.maxOpenPositions ? `max ${e.maxOpenPositions} trades` : null, e.maxLotSize ? `≤${e.maxLotSize.toFixed(2)}/trade` : null].filter(Boolean) as string[];
  const flags = [e.newsFilter ? "news filter" : null, e.skipNoSlTp ? "skip w/o SL·TP" : null, e.customMagic ? `magic ${e.customMagic}` : e.copyMagic ? "copies magic" : null, e.reverse ? "REVERSE" : null].filter(Boolean) as string[];
  return (
    <button type="button" className={`edge${on ? " on" : ""}`} onClick={onClick}>
      <span className="name">{dir === "to" ? "→ " : "← "}{other?.alias ?? "?"}</span>
      <span className={`state ${st}`}>{st === "manage" ? "manage only" : st}</span>
      <span className="meta"><span>{ratio(e)}</span>{lim.map(x => <span key={x} className="lim">{x}</span>)}{flags.map(x => <span key={x}>{x}</span>)}</span>
    </button>
  );
}

function EdgeDetail({ e, byId }: { e: FlowEdge; byId: Map<string, Node> }) {
  const rows: Array<[string, string | number]> = [
    ["From", byId.get(e.from)?.alias ?? e.from], ["To", byId.get(e.to)?.alias ?? e.to], ["State", stateOf(e)], ["Copy", ratio(e)], ["Scale type", e.scaleType],
    ["Total lots cap", e.maximumLot ? e.maximumLot.toFixed(2) : "no limit"], ["Open trades cap", e.maxOpenPositions || "no limit"], ["Per-trade cap", e.maxLotSize ? e.maxLotSize.toFixed(2) : "none"],
    ["Copy SL / TP", `${e.copySL ? "yes" : "no"} / ${e.copyTP ? "yes" : "no"}`], ["Skip w/o SL·TP", e.skipNoSlTp ? "yes" : "no"], ["News filter", e.newsFilter ? "on" : "off"],
    ["Magic on live", e.customMagic ? e.customMagic : e.copyMagic ? "copied from source" : "none"],
    ["Created", e.created ? new Date(e.created).toLocaleDateString("en-GB", { dateStyle: "medium" }) : "—"],
  ];
  return (
    <div className="detail">
      <h3>Copier settings</h3>
      <dl className="kv">{rows.map(([k, v]) => <Row key={k} k={k} v={v} />)}</dl>
    </div>
  );
}
