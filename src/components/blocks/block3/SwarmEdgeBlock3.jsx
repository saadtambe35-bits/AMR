/**
 * SwarmEdge — Block 3: What-If Hazard Planner & Intent Command Bar
 *
 * Exports: <HazardDrawingOverlay />, <NaturalCommandBar />,
 *          parseIntent(), suggest(), planImpact(), astar(), buildCost(), cellsInPolygon()
 *
 * WORLD CONTRACT (grid coordinates are cells, origin top-left):
 * world = {
 *   cols, rows, cellM,                       // grid size and metres per cell
 *   staticBlocked: Set<cellIndex>,           // shelves etc. (index = y*cols + x)
 *   aisles: { 4: { col, y0, y1 } },          // used by "block aisle N"
 *   bays:   { d1: { x, y } },
 * }
 * robots  = [{ id, path:[{x,y}...] (remaining route, path[0] = current cell), goal:{x,y}, goalLabel,
 *              speed (m/s), state: EN_ROUTE|IDLE|WAITING_FOR_LEASE|BLOCKED|E_STOP,
 *              battery, junction, yieldingTo, prio, leaseMs }]
 * hazards = [{ id, type: "blocked"|"caution", poly, cells:[cellIndex], expiresAt? }]
 *
 * Zenoh: both components call publish(keyExpr, payload). Wire it to your session, e.g.
 *   publish={(k, p) => session.put(k, JSON.stringify(p))}
 * Keys used: swarmedge/fleet/hazard/commit and swarmedge/fleet/cmd/<action>.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

/* ───────────────────────── constants ───────────────────────── */
export const HAZARD = {
  blocked: { label: "Blocked zone", color: "#ef4444", cost: Infinity },
  caution: { label: "Slow / caution zone", color: "#f59e0b", cost: 2.5 }, // 2.5× travel time per cell
};
const MONO = `"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace`;
export const defaultPublish = (key, payload) => console.info("[zenoh]", key, payload);
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/* ───────────────────────── geometry + planning ───────────────────────── */
const inPoly = (px, py, poly) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
};
export const rectPoly = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];

export function cellsInPolygon(poly, cols, rows) {
  const xs = poly.map((p) => p.x), ys = poly.map((p) => p.y);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(cols - 1, Math.ceil(Math.max(...xs)) - 1);
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(rows - 1, Math.ceil(Math.max(...ys)) - 1);
  const out = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inPoly(x + 0.5, y + 0.5, poly)) out.push(y * cols + x);
  return out;
}

export function buildCost({ cols, rows, staticBlocked }, hazards) {
  const c = new Float64Array(cols * rows).fill(1);
  staticBlocked.forEach((i) => (c[i] = Infinity));
  hazards.forEach((h) => { const v = HAZARD[h.type].cost; h.cells.forEach((i) => (c[i] = Math.max(c[i], v))); });
  return c;
}

/** 4-connected A*; entry cost per cell; the start cell is always passable. */
export function astar(cost, cols, rows, s, g) {
  const N = cols * rows, si = s.y * cols + s.x, gi = g.y * cols + g.x;
  if (cost[gi] === Infinity) return null;
  const gs = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  const h = (i) => Math.abs((i % cols) - g.x) + Math.abs(((i / cols) | 0) - g.y);
  gs[si] = 0;
  const open = [si];
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (gs[open[k]] + h(open[k]) < gs[open[bi]] + h(open[bi])) bi = k;
    const cur = open[bi];
    open[bi] = open[open.length - 1]; open.pop();
    if (cur === gi) break;
    if (done[cur]) continue;
    done[cur] = 1;
    const cx = cur % cols, cy = (cur / cols) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx, w = cost[ni];
      if (w === Infinity || done[ni]) continue;
      if (gs[cur] + w < gs[ni]) { gs[ni] = gs[cur] + w; prev[ni] = cur; open.push(ni); }
    }
  }
  if (gs[gi] === Infinity) return null;
  const path = [];
  for (let i = gi; i !== -1; i = prev[i]) path.push({ x: i % cols, y: (i / cols) | 0 });
  return { path: path.reverse(), cost: gs[gi] };
}
const pathCost = (path, cost, cols) => path.slice(1).reduce((a, p) => a + cost[p.y * cols + p.x], 0);
const pathKey = (p) => p.map((c) => c.x + "," + c.y).join(" ");

/** Predict the effect of adding `draft` ({type, cells}) on the fleet. Pure, client-side. */
export function planImpact(world, robots, hazards, draft) {
  const { cols, rows, cellM = 1.5 } = world;
  const oldCost = buildCost(world, hazards);
  const newCost = buildCost(world, [...hazards, draft]);
  const hit = new Set(draft.cells);
  const affected = [], usage = new Map(), ghostCells = new Set();
  const use = (path) => path.forEach((p) => { const i = p.y * cols + p.x; usage.set(i, (usage.get(i) || 0) + 1); });

  robots.forEach((r) => {
    if (!r.path || r.path.length < 2) return;
    if (!r.path.some((p) => hit.has(p.y * cols + p.x))) return use(r.path);
    const speed = r.speed || 1.2;
    const res = astar(newCost, cols, rows, r.path[0], r.path[r.path.length - 1]);
    if (!res) { use(r.path); return affected.push({ id: r.id, delayS: 0, ghost: null, stranded: true, at: r.path[0] }); }
    const oldC = pathCost(r.path, oldCost, cols);
    const delayS = Number.isFinite(oldC) ? Math.max(0, ((res.cost - oldC) * cellM) / speed) : 0;
    const rerouted = pathKey(res.path) !== pathKey(r.path);
    use(res.path);
    if (rerouted) res.path.forEach((p) => ghostCells.add(p.y * cols + p.x));
    affected.push({ id: r.id, delayS, ghost: rerouted ? res.path : null, stranded: false, at: r.path[0] });
  });

  let hot = 0;
  ghostCells.forEach((i) => { if ((usage.get(i) || 0) >= 2) hot++; });
  return {
    affected,
    robotsAffected: affected.length,
    stranded: affected.filter((a) => a.stranded).length,
    fleetDelayS: affected.reduce((a, r) => a + r.delayS, 0),
    bottleneck: hot === 0 ? "Low" : hot <= 4 ? "Moderate" : "High",
  };
}

/* ───────────────────────── intent parser ───────────────────────── */
const rid = (s) => { const m = /amr[\s_-]*0*(\d+)/i.exec(s); return m ? `amr_${String(m[1]).padStart(2, "0")}` : null; };
const STATE_WORDS = { idle: "IDLE", moving: "EN_ROUTE", waiting: "WAITING_FOR_LEASE" };

/** ctx = { robots, hazards, aisles, bays }. Returns { ok, reply, action?, highlight?, confirm? } or null. */
export function parseIntent(raw, ctx) {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?.!]+$/, "");
  if (!t) return null;
  const { robots = [], hazards = [], aisles = {}, bays = {} } = ctx;
  const find = (id) => robots.find((r) => r.id === id);
  let m;

  if (/^why\b/.test(t) && rid(t)) {
    const r = find(rid(t));
    if (!r) return { ok: false, reply: `No robot named ${rid(t)} in the fleet.` };
    let reply;
    if (r.state === "E_STOP") reply = `${r.id} is held by the global safety stop. Send "resume all" to release it.`;
    else if (r.yieldingTo) reply = `${r.id} is yielding right-of-way at Junction ${r.junction} to ${r.yieldingTo} (Prio: ${r.prio}, lease active for ${(r.leaseMs / 1000).toFixed(1)}s)`;
    else if (r.state === "BLOCKED") reply = `${r.id} has no route to ${r.goalLabel}: a blocked zone cuts every path. It retries when the zone clears.`;
    else if (r.state === "WAITING_FOR_LEASE") reply = `${r.id} is waiting for a lease at ${r.junction || "the next junction"}.`;
    else if (r.state === "IDLE") reply = r.battery < 25 ? `${r.id} is idle: battery ${r.battery}% is below the dispatch threshold.` : `${r.id} is idle with no mission. Try "dispatch ${r.id} to bay d1".`;
    else reply = `${r.id} is not idle: en route to ${r.goalLabel} (${r.battery}% battery).`;
    return { ok: true, reply, highlight: { ids: [r.id], label: `why ${r.id}` } };
  }

  if (/^(show|list|which|find)\b/.test(t)) {
    if (/battery/.test(t)) {
      const thr = +((/(\d+)/.exec(t) || [])[1]) || 35;
      const low = robots.filter((r) => r.battery < thr);
      const all = [...robots].sort((a, b) => a.battery - b.battery).map((r) => `${r.id} ${r.battery}%`).join(", ");
      return { ok: true, reply: `${low.length} below ${thr}%. ${all}`, highlight: { ids: low.map((r) => r.id), label: `battery < ${thr}%` } };
    }
    if (/blocked/.test(t)) {
      const b = robots.filter((r) => r.state === "BLOCKED" || r.state === "WAITING_FOR_LEASE" || r.yieldingTo);
      return {
        ok: true,
        reply: `${b.length ? b.map((r) => r.id).join(", ") : "No robots"} blocked or yielding. ${hazards.length} active hazard zone${hazards.length === 1 ? "" : "s"}.`,
        highlight: { ids: b.map((r) => r.id), label: "blocked" },
      };
    }
    const w = Object.keys(STATE_WORDS).find((k) => t.includes(k));
    if (w) {
      const l = robots.filter((r) => r.state === STATE_WORDS[w]);
      return { ok: true, reply: `${l.length} ${w}: ${l.map((r) => r.id).join(", ") || "none"}`, highlight: { ids: l.map((r) => r.id), label: w } };
    }
  }

  if ((m = /^(?:block|close)\s+aisle\s+(\d+)(?:\s+for\s+(\d+(?:\.\d+)?)\s*(s|sec|secs|seconds?|m|mins?|minutes?)?)?$/.exec(t))) {
    if (!aisles[m[1]]) return { ok: false, reply: `Aisle ${m[1]} does not exist. Known aisles: ${Object.keys(aisles).join(", ")}.` };
    const n = m[2] ? +m[2] : 30, durationS = /^m/.test(m[3] || "") ? n * 60 : n;
    return { ok: true, reply: `Aisle ${m[1]} blocked for ${durationS}s. Broadcasting virtual obstruction to the swarm.`, action: { type: "block_aisle", aisle: +m[1], durationS } };
  }

  if ((m = /^(?:dispatch|send)\s+(amr[\s_-]*\d+)\s+to\s+(?:bay\s+)?([a-z]\d+)$/.exec(t))) {
    const r = find(rid(m[1]));
    if (!r) return { ok: false, reply: `No robot named ${rid(m[1])} in the fleet.` };
    if (!bays[m[2]]) return { ok: false, reply: `Bay ${m[2]} does not exist. Known bays: ${Object.keys(bays).join(", ")}.` };
    if (r.state === "E_STOP") return { ok: false, reply: `${r.id} is held by the safety stop. Resume first.` };
    return { ok: true, reply: `Mission dispatched: ${r.id} to bay ${m[2]}.`, action: { type: "dispatch", robot: r.id, bay: m[2] }, highlight: { ids: [r.id], label: "dispatch" } };
  }

  if (/^(?:emergency stop|e-?stop|stop|halt)(?:\s+(?:all|fleet|swarm))?$/.test(t))
    return { ok: true, reply: "Emergency stop sent. All robots are holding position.", action: { type: "estop" } };
  if (/^resume(?:\s+(?:all|fleet|swarm))?$/.test(t))
    return { ok: true, confirm: true, reply: "Release the safety hold and resume all robots?", action: { type: "resume" } };

  return { ok: false, reply: `Not sure what "${raw.trim()}" means. Try "why is amr_03 idle?", "list blocked" or "block aisle 4 for 30s".` };
}

export function suggest(input, ctx) {
  const { robots = [], aisles = {}, bays = {} } = ctx;
  const r0 = robots[0]?.id || "amr_01";
  const idle = robots.find((r) => r.state === "IDLE" || r.yieldingTo)?.id || r0;
  const all = [
    `why is ${idle} idle?`, "show battery", "list blocked", "list idle",
    ...Object.keys(aisles).map((a) => `block aisle ${a} for 30s`),
    ...Object.keys(bays).map((b) => `dispatch ${r0} to bay ${b}`),
    "emergency stop all", "resume all",
    ...robots.map((r) => `why is ${r.id} idle?`),
  ];
  const uniq = [...new Set(all)];
  const q = input.trim().toLowerCase();
  if (!q) return uniq.slice(0, 5);
  const toks = q.split(" ");
  return uniq.filter((s) => toks.every((tk) => s.includes(tk))).sort((a, b) => b.startsWith(q) - a.startsWith(q)).slice(0, 6);
}

/* ───────────────────────── styles ───────────────────────── */
const CSS = `
.hz-glass,.nc-panel{background:rgba(9,14,26,.78);backdrop-filter:blur(24px) saturate(160%);-webkit-backdrop-filter:blur(24px) saturate(160%);
  border:1px solid rgba(255,255,255,.12);color:#e2e8f0;box-shadow:0 24px 60px -20px rgba(0,0,0,.85),inset 0 1px 0 rgba(255,255,255,.08)}
.hz-glass{position:absolute;border-radius:14px;padding:10px 14px;pointer-events:auto;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:12.5px}
.hz-mono{font-family:${MONO};font-variant-numeric:tabular-nums}
.hz-btn{appearance:none;cursor:pointer;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:6px 12px;font:500 12px system-ui,sans-serif;
  color:#e2e8f0;background:rgba(148,163,184,.1);transition:transform .08s,background .15s,box-shadow .15s,border-color .15s;display:inline-flex;align-items:center;gap:6px}
.hz-btn:hover{background:rgba(148,163,184,.22);border-color:rgba(255,255,255,.24)}
.hz-btn:active{transform:scale(.96)}
.hz-btn[aria-pressed=true]{background:color-mix(in srgb,var(--c,#38bdf8) 24%,transparent);border-color:var(--c,#38bdf8);box-shadow:0 0 16px -2px var(--c,#38bdf8)}
.hz-btn:disabled{opacity:.35;cursor:not-allowed}
.hz-btn.go{color:#022c22;border:0;background:linear-gradient(135deg,#34d399,#22d3ee);box-shadow:0 0 20px rgba(52,211,153,.45);font-weight:600}
.hz-btn.finish{color:#022c22;border:0;background:linear-gradient(135deg,#10b981,#34d399);box-shadow:0 0 18px rgba(16,185,129,.5);font-weight:600}
.hz-btn:focus-visible,.nc-sug:focus-visible,.nc-btn:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}
.hz-ghost{animation:hz-march .8s linear infinite}
@keyframes hz-march{to{stroke-dashoffset:-14}}
.hz-radar-sweep{transform-origin:center;animation:hz-spin 3s linear infinite}
@keyframes hz-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
.nc-panel{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);width:min(700px,calc(100vw - 32px));z-index:200;border-radius:18px;padding:12px;
  font-family:${MONO};transition:border-color .15s,box-shadow .15s}
.nc-panel[data-flash=ok]{border-color:#34d399;box-shadow:0 0 34px rgba(52,211,153,.4)}
.nc-panel[data-flash=err]{border-color:#ef4444;box-shadow:0 0 34px rgba(239,68,68,.4)}
.nc-pill{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:200;cursor:pointer;border-radius:99px;padding:8px 16px;
  font:500 12.5px ${MONO};color:#94a3b8;background:rgba(10,15,28,.6);backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.1)}
.nc-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#f1f5f9;font:500 15px ${MONO};caret-color:#34d399;caret-shape:block}
.nc-kbd{font:500 11px ${MONO};color:#94a3b8;border:1px solid rgba(255,255,255,.15);border-radius:6px;padding:2px 6px}
.nc-sug{display:block;width:100%;text-align:left;cursor:pointer;border:0;background:transparent;color:#cbd5e1;font:13px ${MONO};padding:7px 10px;border-radius:8px;transition:transform .08s}
.nc-sug[aria-selected=true],.nc-sug:hover{background:rgba(52,211,153,.15);color:#f1f5f9}
.nc-sug:active,.nc-btn:active{transform:scale(.97)}
.nc-btn{cursor:pointer;border:0;background:transparent;color:#94a3b8;font:12px ${MONO};padding:4px 8px;border-radius:8px}
@media (prefers-reduced-motion:reduce){.hz-ghost,.hz-radar-sweep{animation:none}}
`;
const Styles = () => <style>{CSS}</style>;

/* ───────────────────────── 1. Hazard drawing overlay ───────────────────────── */
export function HazardDrawingOverlay({
  world,
  robots,
  hazards = [],
  onCommit,
  onDeleteHazard,
  onClearHazards,
  publish = defaultPublish,
  zIndex = 20
}) {
  const { cols, rows } = world;
  const svgRef = useRef(null);
  const [tool, setTool] = useState("blocked"); // default to "blocked" so drawing works right away
  const [shape, setShape] = useState("rect");
  const [draft, setDraft] = useState(null); // { pts, cursor, drag }
  const [preview, setPreview] = useState(null); // { type, poly }
  const [minimized, setMinimized] = useState(false); // allows hiding the toolbar completely
  const [isDrawingActive, setIsDrawingActive] = useState(true);

  const cancel = useCallback(() => {
    setDraft(null);
    setPreview(null);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") cancel();
      if (e.key === "Backspace" && draft?.pts?.length) {
        setDraft((d) => ({ ...d, pts: d.pts.slice(0, -1) }));
      }
      if (e.key === "Enter" && shape === "polygon" && draft?.pts?.length >= 3) {
        finishPoly(draft.pts);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cancel, draft, shape]);

  const at = (e, snapHalf = false) => {
    if (!svgRef.current) return { x: 0, y: 0 };
    const r = svgRef.current.getBoundingClientRect();
    const x = Math.min(cols, Math.max(0, ((e.clientX - r.left) / r.width) * cols));
    const y = Math.min(rows, Math.max(0, ((e.clientY - r.top) / r.height) * rows));
    return snapHalf ? { x: Math.round(x * 2) / 2, y: Math.round(y * 2) / 2 } : { x, y };
  };

  const finish = (poly) => {
    setPreview({ type: tool || "blocked", poly });
    setDraft(null);
  };

  const finishPoly = (pts) => {
    const clean = pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y);
    if (clean.length >= 3) finish(clean);
  };

  const finishRect = (a, b) => {
    const x0 = Math.floor(Math.min(a.x, b.x));
    const y0 = Math.floor(Math.min(a.y, b.y));
    const x1 = Math.max(x0 + 1, Math.ceil(Math.max(a.x, b.x)));
    const y1 = Math.max(y0 + 1, Math.ceil(Math.max(a.y, b.y)));
    const poly = rectPoly(x0, y0, x1, y1);
    finish(poly);
  };

  // Pointer event handlers for drawing
  const down = (e) => {
    if (!isDrawingActive || preview) return;
    const currentTool = tool || "blocked";
    if (!tool) setTool("blocked");

    if (shape === "rect") {
      const p = at(e);
      // Support both drag and 2-click
      if (!draft) {
        setDraft({ pts: [p, p], drag: true, startP: p });
      } else {
        // Second click finishes rectangle
        finishRect(draft.pts[0], p);
      }
      return;
    }

    // Polygon mode
    const p = at(e, true);
    const pts = draft?.pts || [];
    if (pts.length >= 3 && Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < 0.85) {
      return finishPoly(pts);
    }
    setDraft({ pts: [...pts, p], cursor: p });
  };

  const move = (e) => {
    if (!draft || !isDrawingActive || preview) return;
    const p = at(e);
    if (shape === "rect") {
      setDraft((d) => (d ? { ...d, pts: [d.pts[0], p] } : null));
    } else if (shape === "polygon") {
      setDraft((d) => (d ? { ...d, cursor: at(e, true) } : null));
    }
  };

  const up = (e) => {
    if (!draft?.drag || shape !== "rect") return;
    const p = at(e);
    const [a] = draft.pts;
    // If dragged more than 0.3 units, finish immediately
    if (Math.hypot(p.x - a.x, p.y - a.y) > 0.3) {
      finishRect(a, p);
    }
  };

  // Global window listeners while dragging to prevent dropped events
  useEffect(() => {
    if (!draft?.drag) return;
    const onWinMove = (e) => {
      if (shape === "rect") {
        const p = at(e);
        setDraft((d) => (d ? { ...d, pts: [d.pts[0], p] } : null));
      }
    };
    const onWinUp = (e) => {
      if (draft?.drag && shape === "rect") {
        const p = at(e);
        const [a] = draft.pts;
        if (Math.hypot(p.x - a.x, p.y - a.y) > 0.3) {
          finishRect(a, p);
        }
      }
    };
    window.addEventListener("pointermove", onWinMove);
    window.addEventListener("pointerup", onWinUp);
    return () => {
      window.removeEventListener("pointermove", onWinMove);
      window.removeEventListener("pointerup", onWinUp);
    };
  }, [draft?.drag, shape]);

  const impact = useMemo(() => {
    if (!preview) return null;
    const cells = cellsInPolygon(preview.poly, cols, rows);
    return { cells, ...planImpact(world, robots, hazards, { type: preview.type, cells }) };
  }, [preview, robots, hazards, world, cols, rows]);

  const commit = () => {
    const h = {
      id: `hz_${Date.now().toString(36)}`,
      type: preview.type,
      poly: preview.poly,
      cells: impact.cells,
      createdAt: Date.now()
    };
    publish("swarmedge/fleet/hazard/commit", {
      id: h.id,
      type: h.type,
      poly: h.poly,
      cells: h.cells,
      cost_multiplier: h.type === "blocked" ? null : HAZARD.caution.cost,
      ts: h.createdAt,
    });
    onCommit?.(h, impact);
    setPreview(null);
  };

  const pts2s = (pts) => pts.map((p) => `${p.x},${p.y}`).join(" ");
  const col = (t) => HAZARD[t]?.color || "#ef4444";
  const ctr = (path) => path.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(" ");
  const activeToolColor = HAZARD[tool || "blocked"].color;

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex }}>
      <Styles />

      {/* SVG Interaction Layer for Drawing */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${cols} ${rows}`}
        preserveAspectRatio="none"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          touchAction: "none",
          cursor: isDrawingActive && !preview ? "crosshair" : "default",
          pointerEvents: isDrawingActive && !preview ? "auto" : "none"
        }}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onDoubleClick={() => shape === "polygon" && draft && finishPoly(draft.pts)}
      >
        <defs>
          {Object.entries(HAZARD).map(([k, v]) => (
            <pattern key={k} id={`hz-${k}`} width=".5" height=".5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width=".5" height=".5" fill={v.color} fillOpacity=".16" />
              <line x1="0" y1="0" x2="0" y2=".5" stroke={v.color} strokeOpacity=".8" strokeWidth=".12" />
            </pattern>
          ))}
        </defs>

        {/* Existing Committed Hazards with Delete Interaction */}
        {hazards.map((h) => {
          const center = h.poly.reduce(
            (acc, p) => ({ x: acc.x + p.x / h.poly.length, y: acc.y + p.y / h.poly.length }),
            { x: 0, y: 0 }
          );
          return (
            <g
              key={h.id}
              style={{ cursor: "pointer", pointerEvents: "auto" }}
              onClick={(e) => {
                e.stopPropagation();
                onDeleteHazard?.(h.id);
              }}
            >
              <polygon
                points={pts2s(h.poly)}
                fill={`url(#hz-${h.type})`}
                stroke={col(h.type)}
                strokeWidth="2.2"
                vectorEffect="non-scaling-stroke"
                style={{ filter: `drop-shadow(0 0 6px ${col(h.type)}66)` }}
              >
                <title>Click to delete {h.type} hazard zone</title>
              </polygon>
              {/* Subtle interactive delete icon in center of polygon */}
              <g transform={`translate(${center.x}, ${center.y})`} style={{ pointerEvents: "none" }}>
                <circle r="0.45" fill="rgba(15, 23, 42, 0.9)" stroke={col(h.type)} strokeWidth="0.08" />
                <text x="0" y="0.15" textAnchor="middle" fontSize="0.42" fill="#ffffff" fontWeight="bold">✕</text>
              </g>
            </g>
          );
        })}

        {/* Live Active Preview & What-If Ghost Routes */}
        {preview && (
          <>
            <polygon
              points={pts2s(preview.poly)}
              fill={`url(#hz-${preview.type})`}
              stroke={col(preview.type)}
              strokeWidth="2.5"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
            {impact?.affected?.map((a) => (
              <g key={a.id}>
                {a.ghost && (
                  <polyline
                    points={ctr(a.ghost)}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="2.8"
                    strokeDasharray="6 6"
                    strokeLinecap="round"
                    className="hz-ghost"
                    vectorEffect="non-scaling-stroke"
                    style={{ filter: "drop-shadow(0 0 6px #22d3ee)" }}
                  />
                )}
                <circle
                  cx={a.at.x + 0.5}
                  cy={a.at.y + 0.5}
                  r=".75"
                  fill="none"
                  stroke={a.stranded ? "#ef4444" : "#22d3ee"}
                  strokeWidth="2.2"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ))}
          </>
        )}

        {/* Rectangle Active Drawing Preview */}
        {draft && shape === "rect" && draft.pts.length === 2 && (
          <g>
            <rect
              x={Math.min(draft.pts[0].x, draft.pts[1].x)}
              y={Math.min(draft.pts[0].y, draft.pts[1].y)}
              width={Math.max(0.1, Math.abs(draft.pts[1].x - draft.pts[0].x))}
              height={Math.max(0.1, Math.abs(draft.pts[1].y - draft.pts[0].y))}
              fill={activeToolColor}
              fillOpacity=".24"
              stroke={activeToolColor}
              strokeWidth="2.5"
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        )}

        {/* Polygon Active Drawing Preview */}
        {draft && shape === "polygon" && (
          <g>
            <polyline
              points={pts2s(draft.cursor ? [...draft.pts, draft.cursor] : draft.pts)}
              fill={activeToolColor}
              fillOpacity=".16"
              stroke={activeToolColor}
              strokeWidth="2.5"
              strokeDasharray="5 3"
              vectorEffect="non-scaling-stroke"
            />
            {draft.pts.map((p, i) => (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={i === 0 ? ".36" : ".22"} fill={activeToolColor} stroke="#ffffff" strokeWidth="0.06" />
                <circle cx={p.x} cy={p.y} r={i === 0 ? ".5" : ".3"} fill="none" stroke={activeToolColor} strokeWidth="0.04" strokeDasharray="0.2 0.2" />
              </g>
            ))}
          </g>
        )}
      </svg>

      {/* ────────────────── Non-Blocking Sleek Floating Controls ────────────────── */}
      {minimized ? (
        /* Minimized Tiny Floating Pill (Takes Zero Map View Space) */
        <button
          className="hz-btn"
          style={{
            position: "absolute",
            top: 10,
            left: 12,
            zIndex: 35,
            pointerEvents: "auto",
            background: "rgba(9, 14, 26, 0.88)",
            backdropFilter: "blur(16px)",
            borderColor: activeToolColor,
            boxShadow: `0 0 16px -2px ${activeToolColor}88`,
            padding: "6px 12px",
            borderRadius: "99px"
          }}
          onClick={() => setMinimized(false)}
          title="Expand Hazard Drawing Tools"
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: activeToolColor }} />
          <span style={{ fontWeight: 600 }}>✏️ Draw {HAZARD[tool || "blocked"].label}</span>
          <span style={{ opacity: 0.6, fontSize: 11 }}>▾ expand</span>
        </button>
      ) : (
        /* Sleek Glassmorphic Control Strip Docked Cleanly at Top-Left */
        <div
          className="hz-glass"
          style={{
            top: 10,
            left: 12,
            display: "grid",
            gap: 8,
            maxWidth: 380,
            background: "rgba(8, 13, 24, 0.88)",
            border: "1px solid rgba(255, 255, 255, 0.14)",
            boxShadow: "0 16px 40px -10px rgba(0,0,0,0.85)",
            zIndex: 35
          }}
          role="toolbar"
          aria-label="Hazard tools"
        >
          {/* Header Row with Title and Minimize Toggle */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 11.5, letterSpacing: "0.5px", color: "#38bdf8" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#38bdf8", boxShadow: "0 0 8px #38bdf8" }} />
              <span>WHAT-IF HAZARD PLANNER</span>
            </div>
            <button
              className="hz-btn"
              style={{ padding: "2px 8px", fontSize: 11, borderRadius: 6, opacity: 0.8 }}
              onClick={() => setMinimized(true)}
              title="Minimize toolbar to unblock view"
            >
              − minimize
            </button>
          </div>

          {/* Row 1: Zone Type Selector */}
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(HAZARD).map(([k, v]) => (
              <button
                key={k}
                className="hz-btn"
                style={{ "--c": v.color, flex: 1, justifyContent: "center" }}
                aria-pressed={tool === k && isDrawingActive}
                disabled={!!preview}
                onClick={() => {
                  setDraft(null);
                  setTool(k);
                  setIsDrawingActive(true);
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: v.color }} />
                <span>{k === "blocked" ? "Blocked (Stop)" : "Caution (Slow)"}</span>
              </button>
            ))}
          </div>

          {/* Row 2: Shape Selector & Active Action Controls */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {[["rect", "⬚ Rectangle"], ["polygon", "⬡ Polygon"]].map(([k, l]) => (
              <button
                key={k}
                className="hz-btn"
                style={{ flex: 1, justifyContent: "center" }}
                aria-pressed={shape === k && isDrawingActive}
                disabled={!!preview}
                onClick={() => {
                  setShape(k);
                  setDraft(null);
                  if (!tool) setTool("blocked");
                  setIsDrawingActive(true);
                }}
              >
                {l}
              </button>
            ))}

            {/* Finish Polygon Button (Lights up when >= 3 points are clicked) */}
            {shape === "polygon" && draft?.pts?.length >= 3 && (
              <button
                className="hz-btn finish"
                onClick={() => finishPoly(draft.pts)}
                title="Complete polygon zone"
              >
                ✓ Finish ({draft.pts.length} pts)
              </button>
            )}

            {/* Cancel Draft Button */}
            {draft && (
              <button className="hz-btn" onClick={() => setDraft(null)} title="Cancel current drawing">
                ✕
              </button>
            )}

            {/* Clear All Hazards Button */}
            {hazards.length > 0 && !preview && (
              <button
                className="hz-btn"
                style={{ color: "#f87171", borderColor: "rgba(239,68,68,0.3)" }}
                onClick={() => onClearHazards?.()}
                title="Remove all active hazard zones"
              >
                Clear ({hazards.length})
              </button>
            )}
          </div>

          {/* Real-Time Helper Text */}
          <div style={{ fontSize: 11.5, color: "#94a3b8", lineHeight: 1.4, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: activeToolColor }}>●</span>
            {shape === "rect" ? (
              draft?.drag ? (
                <span style={{ color: "#38bdf8" }}>Release mouse to complete rectangle</span>
              ) : (
                <span>Drag on map or click 2 opposite corners</span>
              )
            ) : (
              <span>
                Click to add points {draft?.pts?.length ? `(${draft.pts.length} added)` : ""}. Click Finish when done.
              </span>
            )}
          </div>
        </div>
      )}

      {/* ────────────────── What-If Impact Prediction Card ────────────────── */}
      {preview && impact && (
        <div
          className="hz-glass"
          role="status"
          aria-live="polite"
          style={{
            right: 14,
            bottom: 14,
            width: 310,
            borderColor: `${col(preview.type)}88`,
            boxShadow: `0 0 35px -6px ${col(preview.type)}55`,
            background: "rgba(8, 14, 26, 0.94)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13.5 }}>
              <i style={{ width: 10, height: 10, borderRadius: 3, background: col(preview.type), boxShadow: `0 0 10px ${col(preview.type)}` }} />
              <span>What-If: {HAZARD[preview.type].label}</span>
            </div>
            <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: "rgba(255,255,255,0.08)", color: "#94a3b8" }}>
              {impact.cells.length} cells
            </span>
          </div>

          {impact.cells.length === 0 ? (
            <p style={{ margin: "0 0 12px", color: "#fbbf24", fontSize: 12 }}>
              Zone covers no grid cells. Please draw a slightly larger zone.
            </p>
          ) : (
            <div className="hz-mono" style={{ display: "grid", gap: 6, marginBottom: 12, fontSize: 12.5 }}>
              <Row k="Robots Affected" v={impact.robotsAffected} />
              <Row k="Estimated Delay" v={`+${impact.fleetDelayS.toFixed(1)} s`} c="#f59e0b" />
              <Row
                k="Bottleneck Probability"
                v={impact.bottleneck}
                c={impact.bottleneck === "Low" ? "#10b981" : impact.bottleneck === "Moderate" ? "#f59e0b" : "#ef4444"}
              />
              {impact.stranded > 0 && <Row k="No Route (Stranded)" v={impact.stranded} c="#ef4444" />}
              {impact.affected.length > 0 && (
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,.08)", fontSize: 11.5, color: "#94a3b8", display: "grid", gap: 3 }}>
                  {impact.affected.map((a) => (
                    <div key={a.id} style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#e2e8f0" }}>{a.id}</span>
                      <span style={{ color: a.stranded ? "#ef4444" : "#22d3ee" }}>
                        {a.stranded ? "blocked / stranded" : a.ghost ? `reroute +${a.delayS.toFixed(1)}s` : `slowed +${a.delayS.toFixed(1)}s`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="hz-btn go" style={{ flex: 1 }} disabled={impact.cells.length === 0} onClick={commit}>
              ✓ Commit to Swarm
            </button>
            <button className="hz-btn" onClick={() => setPreview(null)}>
              ✕ Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
const Row = ({ k, v, c = "#e2e8f0" }) => (
  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
    <span style={{ color: "#94a3b8" }}>{k}</span>
    <span style={{ color: c, fontWeight: 600, textShadow: `0 0 12px ${c}55` }}>{v}</span>
  </div>
);


/* ───────────────────────── 2. Natural command bar ───────────────────────── */
export function NaturalCommandBar({ world, onAction, onHighlight, publish = defaultPublish }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [log, setLog] = useState(null);
  const [hist, setHist] = useState([]);
  const [showHist, setShowHist] = useState(false);
  const [sel, setSel] = useState(-1);
  const [pending, setPending] = useState(null);
  const [flash, setFlash] = useState(null);
  const [hi, setHi] = useState(-1);
  const inputRef = useRef(null);
  const sugs = useMemo(() => suggest(val, world), [val, world]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if (e.key.toLowerCase() === "k" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const buzz = (k) => { setFlash(k); setTimeout(() => setFlash(null), 350); };

  const run = (text) => {
    const res = parseIntent(text, world);
    if (!res) return;
    const key = text.trim().toLowerCase();
    if (res.confirm && pending !== key) { setPending(key); setLog({ ok: true, warn: true, reply: `${res.reply} Press Enter again to confirm.` }); buzz("ok"); return; }
    setPending(null);
    if (res.ok && res.action) {
      onAction?.(res.action);
      publish(`swarmedge/fleet/cmd/${res.action.type}`, { ...res.action, ts: Date.now(), source: "operator-bar" });
    }
    if (res.ok && res.highlight) onHighlight?.(res.highlight);
    setLog(res);
    setHist((h) => [{ text: text.trim(), ok: res.ok, reply: res.reply, ts: Date.now() }, ...h].slice(0, 30));
    setVal(""); setSel(-1); setHi(-1);
    buzz(res.ok ? "ok" : "err");
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { showHist ? setShowHist(false) : setOpen(false); return; }
    if (e.key === "Enter") { e.preventDefault(); run(sel >= 0 && sugs[sel] ? sugs[sel] : val); return; }
    if (e.key === "Tab") { e.preventDefault(); const s = sugs[Math.max(sel, 0)]; if (s) { setVal(s); setSel(-1); } return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      if (!val || hi >= 0) {
        const n = Math.min(hist.length - 1, Math.max(-1, hi - dir));
        setHi(n); setVal(n >= 0 ? hist[n].text : "");
      } else setSel((s) => Math.min(sugs.length - 1, Math.max(-1, s + dir)));
    }
  };

  if (!open) return (
    <>
      <Styles />
      <button className="nc-pill" onClick={() => setOpen(true)}>Press <span className="nc-kbd">/</span> for commands</button>
    </>
  );

  return (
    <div className="nc-panel backdrop-blur-xl" data-flash={flash} role="dialog" aria-label="Command bar">
      <Styles />
      {showHist && (
        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          {hist.length === 0 && <div style={{ color: "#64748b", fontSize: 12, padding: 6 }}>No commands yet.</div>}
          {hist.map((h) => (
            <button key={h.ts} className="nc-sug" title={h.reply} onClick={() => { setVal(h.text); setShowHist(false); inputRef.current?.focus(); }}>
              <span style={{ color: h.ok ? "#34d399" : "#ef4444", marginRight: 8 }}>{h.ok ? "✓" : "✗"}</span>{h.text}
              <span style={{ float: "right", color: "#64748b", fontSize: 11 }}>{new Date(h.ts).toLocaleTimeString([], { hour12: false })}</span>
            </button>
          ))}
        </div>
      )}
      {log && (
        <div role="status" aria-live="polite" style={{ padding: "4px 8px 10px", fontSize: 13, lineHeight: 1.5, color: log.warn ? "#fbbf24" : log.ok ? "#a7f3d0" : "#fca5a5" }}>
          <span style={{ marginRight: 8 }}>{log.warn ? "!" : log.ok ? "✓" : "✗"}</span>{log.reply}
        </div>
      )}
      {sugs.length > 0 && (
        <div role="listbox" aria-label="Suggestions" style={{ marginBottom: 6 }}>
          {sugs.map((s, i) => (
            <button key={s} role="option" aria-selected={i === sel} className="nc-sug" onClick={() => { setVal(s); setSel(-1); inputRef.current?.focus(); }}>{s}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderTop: "1px solid rgba(255,255,255,.08)" }}>
        <span style={{ color: "#34d399", fontWeight: 700, textShadow: "0 0 10px #34d39988" }}>swarm ›</span>
        <input ref={inputRef} className="nc-input" value={val} spellCheck={false} autoComplete="off" aria-label="Command"
          placeholder="ask or command the swarm" onChange={(e) => { setVal(e.target.value); setSel(-1); setHi(-1); setPending(null); }} onKeyDown={onKeyDown} />
        <button className="nc-btn" aria-pressed={showHist} onClick={() => setShowHist((s) => !s)}>History</button>
        <span className="nc-kbd">esc</span>
      </div>
    </div>
  );
}

/* ───────────────────────── demo world ───────────────────────── */
const COLS = 30, ROWS = 18, CELL_M = 1.5;
const AISLE_COLS = [2, 7, 12, 17, 22, 27];
const BAYS = { d1: { x: 4, y: 17 }, d2: { x: 11, y: 17 }, d3: { x: 18, y: 17 }, d4: { x: 25, y: 17 } };
const DEMO_WORLD = (() => {
  const staticBlocked = new Set();
  for (let y = 3; y <= 14; y++) if (y !== 8) for (let x = 3; x <= 26; x++) if (!AISLE_COLS.includes(x)) staticBlocked.add(y * COLS + x);
  const aisles = {};
  AISLE_COLS.forEach((c, i) => (aisles[i + 1] = { col: c, y0: 3, y1: 14 }));
  return { cols: COLS, rows: ROWS, cellM: CELL_M, staticBlocked, aisles, bays: BAYS };
})();
const JUNCTIONS = [1, 8, 16].flatMap((y, ri) => AISLE_COLS.map((x, ci) => ({ name: `N${ri * 6 + ci + 1}`, x, y })));
const bayKeys = Object.keys(BAYS);

function makeRobot(id, at, battery, goalKey) {
  const r = { id, path: [at], progress: 0, state: "EN_ROUTE", battery, speed: 1.2, junction: null, yieldingTo: null, prio: "Normal", leaseMs: 0, goal: at, goalLabel: "" };
  if (goalKey) assign(r, goalKey, buildCost(DEMO_WORLD, []));
  else r.state = "IDLE";
  return r;
}
function assign(r, bay, cost) {
  const res = astar(cost, COLS, ROWS, r.path[0], BAYS[bay]);
  r.goal = BAYS[bay]; r.goalLabel = `bay ${bay}`;
  if (res) { r.path = res.path; r.progress = 0; r.state = "EN_ROUTE"; } else r.state = "BLOCKED";
}
function initRobots() {
  const list = [
    makeRobot("amr_01", { x: 2, y: 1 }, 82, "d3"), makeRobot("amr_02", { x: 12, y: 8 }, 64, "d1"),
    makeRobot("amr_03", { x: 21, y: 1 }, 71), makeRobot("amr_04", { x: 7, y: 16 }, 23, "d4"),
    makeRobot("amr_05", { x: 27, y: 10 }, 55, "d2"), makeRobot("amr_06", { x: 17, y: 16 }, 31, "d1"),
  ];
  Object.assign(list[2], { junction: "N5", yieldingTo: "amr_01", prio: "High", leaseMs: 1800 });
  return list;
}

function useDemoWorld() {
  const rob = useRef(null);
  if (!rob.current) rob.current = initRobots();
  const [hazards, setHazards] = useState([]);
  const [hl, setHl] = useState(null);
  const [, tick] = useState(0);
  const hz = useRef(hazards);
  hz.current = hazards;

  const replan = (r) => {
    if (r.state !== "EN_ROUTE" && r.state !== "BLOCKED") return;
    const res = astar(buildCost(DEMO_WORLD, hz.current), COLS, ROWS, r.path[0], r.goal);
    if (res) { r.path = res.path; r.progress = 0; r.state = "EN_ROUTE"; } else r.state = "BLOCKED";
  };
  useEffect(() => { rob.current.forEach(replan); }, [hazards]);

  useEffect(() => {
    const id = setInterval(() => {
      const cost = buildCost(DEMO_WORLD, hz.current);
      rob.current.forEach((r) => {
        if (r.state !== "EN_ROUTE") return;
        if (r.path.length < 2) return assign(r, bayKeys[Math.floor(Math.random() * bayKeys.length)], cost);
        const nxt = r.path[1];
        r.progress += (0.25 * r.speed) / CELL_M / cost[nxt.y * COLS + nxt.x];
        while (r.progress >= 1 && r.path.length > 1) { r.path.shift(); r.progress -= 1; }
      });
      setHazards((h) => (h.some((x) => x.expiresAt && x.expiresAt <= Date.now()) ? h.filter((x) => !x.expiresAt || x.expiresAt > Date.now()) : h));
      tick((n) => n + 1);
    }, 250);
    return () => clearInterval(id);
  }, []);

  const onAction = (a) => {
    const R = rob.current;
    if (a.type === "block_aisle") {
      const A = DEMO_WORLD.aisles[a.aisle], poly = rectPoly(A.col, A.y0, A.col + 1, A.y1 + 1);
      setHazards((h) => [...h, { id: `hz_cmd_${Date.now()}`, type: "blocked", poly, cells: cellsInPolygon(poly, COLS, ROWS), expiresAt: Date.now() + a.durationS * 1000 }]);
    } else if (a.type === "dispatch") {
      const r = R.find((x) => x.id === a.robot);
      r.yieldingTo = null;
      assign(r, a.bay, buildCost(DEMO_WORLD, hz.current));
    } else if (a.type === "estop") R.forEach((r) => { if (r.state !== "E_STOP") { r.prev = r.state; r.state = "E_STOP"; } });
    else if (a.type === "resume") R.forEach((r) => { if (r.state === "E_STOP") { r.state = r.prev; replan(r); } });
  };
  const deleteHazard = (id) => setHazards((h) => h.filter((x) => x.id !== id));
  const clearHazards = () => setHazards([]);
  const addHazard = (h) => setHazards((x) => [...x, h]);
  const onHighlight = (h) => { setHl(h); clearTimeout(onHighlight.t); onHighlight.t = setTimeout(() => setHl(null), 8000); };

  const robots = rob.current.map((r) => ({ ...r, path: r.path.slice() }));
  return { robots, hazards, hl, onAction, onHighlight, addHazard, deleteHazard, clearHazards };
}

const STATE_COLOR = {
  EN_ROUTE: "#10b981",
  IDLE: "#64748b",
  WAITING_FOR_LEASE: "#f59e0b",
  BLOCKED: "#ef4444",
  E_STOP: "#ef4444"
};

const CRATE_PALETTES = [
  { fill: "#0284c7", stroke: "#38bdf8", band: "rgba(255,255,255,0.4)" }, // sapphire
  { fill: "#d97706", stroke: "#fbbf24", band: "rgba(0,0,0,0.3)" },       // amber
  { fill: "#059669", stroke: "#34d399", band: "rgba(255,255,255,0.3)" }, // emerald
  { fill: "#475569", stroke: "#94a3b8", band: "rgba(255,255,255,0.2)" }, // slate
  { fill: "#b45309", stroke: "#f59e0b", band: "rgba(0,0,0,0.4)" },       // bronze
];

export default function SwarmEdgeBlock3Demo() {
  const { robots, hazards, hl, onAction, onHighlight, addHazard, deleteHazard, clearHazards } = useDemoWorld();
  const ctx = useMemo(() => ({ robots, hazards, aisles: DEMO_WORLD.aisles, bays: BAYS }), [robots, hazards]);
  const [hoveredRobot, setHoveredRobot] = useState(null);

  // Group static blocked cells into shelf blocks for realistic rendering
  const shelfCells = useMemo(() => {
    return [...DEMO_WORLD.staticBlocked].map((i) => {
      const cx = i % COLS;
      const cy = (i / COLS) | 0;
      // Deterministic cargo crate pattern per cell
      const hash = (cx * 17 + cy * 31) % CRATE_PALETTES.length;
      const crate1 = CRATE_PALETTES[hash];
      const crate2 = CRATE_PALETTES[(hash + 1) % CRATE_PALETTES.length];
      return { idx: i, cx, cy, crate1, crate2 };
    });
  }, []);

  return (
    <div style={{ minHeight: "100vh", padding: 20, background: "radial-gradient(circle at 15% 10%,#0f2238 0%,#09101d 45%,#040710 100%)" }}>
      {/* Container with sleek border glow */}
      <div style={{
        position: "relative",
        maxWidth: 1060,
        margin: "0 auto",
        aspectRatio: `${COLS}/${ROWS}`,
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid rgba(56, 189, 248, 0.2)",
        boxShadow: "0 25px 60px -15px rgba(0,0,0,0.9), 0 0 35px -10px rgba(56, 189, 248, 0.15)",
        background: "#080e1a"
      }}>
        {/* High-Tech Cyber Warehouse Vector Graphic Map */}
        <svg viewBox={`0 0 ${COLS} ${ROWS}`} preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          <defs>
            {/* Warehouse floor grid pattern */}
            <pattern id="wh-floor-grid" width="1" height="1" patternUnits="userSpaceOnUse">
              <rect width="1" height="1" fill="#080e1a" />
              <path d="M 1 0 L 0 0 0 1" fill="none" stroke="rgba(255,255,255,0.035)" strokeWidth="0.03" />
              <circle cx="0.5" cy="0.5" r="0.04" fill="rgba(56,189,248,0.12)" />
            </pattern>

            {/* Dock hazard stripes pattern */}
            <pattern id="wh-hazard-stripe" width="0.4" height="0.4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="0.2" height="0.4" fill="#eab308" />
              <rect x="0.2" width="0.2" height="0.4" fill="#0f172a" />
            </pattern>

            {/* Drop shadow filter */}
            <filter id="amr-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="0.15" stdDeviation="0.25" floodColor="#000000" floodOpacity="0.8" />
            </filter>
            <filter id="neon-glow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="0.3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* 1. Cyber Warehouse Floor Grid */}
          <rect width={COLS} height={ROWS} fill="url(#wh-floor-grid)" />

          {/* 2. Corridor Transit Guide Tracks */}
          {AISLE_COLS.map((col, idx) => (
            <g key={`track_${col}`}>
              {/* Lane bed */}
              <rect x={col + 0.15} y="1" width="0.7" height={ROWS - 3} fill="rgba(56, 189, 248, 0.025)" />
              {/* Center dashed ceramic guide line */}
              <line
                x1={col + 0.5} y1="1"
                x2={col + 0.5} y2={ROWS - 2}
                stroke="rgba(255,255,255,0.22)"
                strokeWidth="0.04"
                strokeDasharray="0.3 0.2"
              />
              {/* Aisle header badge */}
              <g transform={`translate(${col + 0.5}, 0.75)`}>
                <rect x="-0.85" y="-0.3" width="1.7" height="0.6" rx="0.15" fill="#0f1b2e" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="0.04" />
                <circle cx="-0.55" cy="0" r="0.08" fill="#38bdf8" />
                <text x="0.1" y="0.12" fontSize="0.32" fontWeight="700" textAnchor="middle" fill="#e2e8f0" fontFamily={MONO}>
                  AISLE {idx + 1}
                </text>
              </g>
            </g>
          ))}

          {/* Cross Corridors (Top Transit Highway & Mid-Aisle) */}
          <line x1="1" y1="1.5" x2={COLS - 1} y2="1.5" stroke="rgba(255,255,255,0.2)" strokeWidth="0.04" strokeDasharray="0.4 0.25" />
          <line x1="1" y1="8.5" x2={COLS - 1} y2="8.5" stroke="rgba(255,255,255,0.2)" strokeWidth="0.04" strokeDasharray="0.4 0.25" />
          <line x1="1" y1="16.5" x2={COLS - 1} y2="16.5" stroke="rgba(255,255,255,0.2)" strokeWidth="0.04" strokeDasharray="0.4 0.25" />

          {/* 3. Industrial Warehouse Storage Racks with Multi-Color Pallet Cargo Boxes */}
          {shelfCells.map(({ idx, cx, cy, crate1, crate2 }) => (
            <g key={`shelf_${idx}`}>
              {/* Steel rack bay frame */}
              <rect x={cx + 0.04} y={cy + 0.04} width="0.92" height="0.92" rx="0.08" fill="#111c2e" stroke="#1e2e46" strokeWidth="0.05" />
              {/* Shelf steel tier divider */}
              <line x1={cx + 0.08} y1={cy + 0.5} x2={cx + 0.92} y2={cy + 0.5} stroke="#273954" strokeWidth="0.035" />

              {/* Top tier pallet crate */}
              <rect x={cx + 0.12} y={cy + 0.12} width="0.76" height="0.32" rx="0.04" fill={crate1.fill} stroke={crate1.stroke} strokeWidth="0.025" />
              {/* Crate vertical strapping band */}
              <line x1={cx + 0.36} y1={cy + 0.12} x2={cx + 0.36} y2={cy + 0.44} stroke={crate1.band} strokeWidth="0.03" />
              <line x1={cx + 0.64} y1={cy + 0.12} x2={cx + 0.64} y2={cy + 0.44} stroke={crate1.band} strokeWidth="0.03" />
              {/* Barcode / shipping label tag */}
              <rect x={cx + 0.42} y={cy + 0.2} width="0.16" height="0.12" rx="0.02" fill="#ffffff" opacity="0.85" />

              {/* Bottom tier pallet crate */}
              <rect x={cx + 0.12} y={cy + 0.56} width="0.76" height="0.32" rx="0.04" fill={crate2.fill} stroke={crate2.stroke} strokeWidth="0.025" />
              {/* Crate vertical strapping band */}
              <line x1={cx + 0.36} y1={cy + 0.56} x2={cx + 0.36} y2={cy + 0.88} stroke={crate2.band} strokeWidth="0.03" />
              <line x1={cx + 0.64} y1={cy + 0.56} x2={cx + 0.64} y2={cy + 0.88} stroke={crate2.band} strokeWidth="0.03" />
              {/* Barcode / shipping label tag */}
              <rect x={cx + 0.42} y={cy + 0.64} width="0.16" height="0.12" rx="0.02" fill="#ffffff" opacity="0.85" />
            </g>
          ))}

          {/* 4. Automated Conveyor Docking Bays (d1 to d4) */}
          {Object.entries(BAYS).map(([k, b]) => (
            <g key={`bay_${k}`} transform={`translate(${b.x}, ${b.y - 0.75})`}>
              {/* Hazard perimeter frame */}
              <rect x="-0.15" y="-0.15" width="1.3" height="1.0" rx="0.1" fill="url(#wh-hazard-stripe)" />
              {/* Dock platform */}
              <rect x="-0.05" y="-0.05" width="1.1" height="0.8" rx="0.08" fill="#091424" stroke="#0e7490" strokeWidth="0.06" />
              {/* Conveyor rollers */}
              {[-0.01, 0.15, 0.31, 0.47, 0.63].map((rx, ri) => (
                <line key={`roller_${ri}`} x1={rx} y1="0.08" x2={rx} y2="0.62" stroke="#334155" strokeWidth="0.04" />
              ))}
              {/* Wireless optical charging beacon circle */}
              <circle cx="0.5" cy="0.35" r="0.22" fill="none" stroke="#22d3ee" strokeWidth="0.04" strokeDasharray="0.15 0.1" />
              <circle cx="0.5" cy="0.35" r="0.08" fill="#06b6d4" />
              {/* Illuminated Station Sign */}
              <rect x="-0.1" y="-0.5" width="1.2" height="0.4" rx="0.08" fill="#082f49" stroke="#38bdf8" strokeWidth="0.03" />
              <circle cx="0.05" cy="-0.3" r="0.06" fill="#10b981" />
              <text x="0.6" y="-0.22" fontSize="0.28" fontWeight="800" textAnchor="middle" fill="#67e8f9" fontFamily={MONO}>
                {k.toUpperCase()} DOCK
              </text>
            </g>
          ))}

          {/* 5. Navigation Junction Beacons (N1 to N18) */}
          {JUNCTIONS.map((j) => (
            <g key={j.name} transform={`translate(${j.x + 0.5}, ${j.y + 0.5})`}>
              <circle r="0.22" fill="#0c182b" stroke="rgba(56, 189, 248, 0.35)" strokeWidth="0.03" />
              <circle r="0.07" fill="#38bdf8" opacity="0.8" />
              <path d="M -0.15 0 L 0.15 0 M 0 -0.15 L 0 0.15" stroke="rgba(255,255,255,0.4)" strokeWidth="0.02" />
            </g>
          ))}

          {/* 6. Active Robot Navigation Paths */}
          {robots.map((r) => {
            if (!r.path || r.path.length < 2) return null;
            const pts = r.path.map((p) => `${p.x + 0.5},${p.y + 0.5}`).join(" ");
            const sc = STATE_COLOR[r.state] || "#10b981";
            return (
              <polyline
                key={`path_${r.id}`}
                points={pts}
                fill="none"
                stroke={sc}
                strokeWidth="0.09"
                strokeDasharray="0.25 0.15"
                opacity="0.65"
              />
            );
          })}

          {/* 7. High-Detail Cyber-Industrial AMRs (NEXUS-7 style) */}
          {robots.map((r) => {
            const a = r.path[0], b = r.path[1] || a;
            const x = a.x + 0.5 + (b.x - a.x) * r.progress;
            const y = a.y + 0.5 + (b.y - a.y) * r.progress;
            const sc = STATE_COLOR[r.state] || "#10b981";
            const lit = hl?.ids?.includes(r.id);

            // Compute direction of travel for realistic forward orientation
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const angleRad = Math.hypot(dx, dy) > 0.01 ? Math.atan2(dy, dx) : 0;
            const angleDeg = (angleRad * 180) / Math.PI;

            return (
              <g
                key={r.id}
                transform={`translate(${x}, ${y})`}
                filter="url(#amr-shadow)"
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredRobot(r)}
                onMouseLeave={() => setHoveredRobot((curr) => (curr?.id === r.id ? null : curr))}
              >
                {/* Active Highlight Selection Ring */}
                {lit && (
                  <circle r="1.1" fill="none" stroke="#fbbf24" strokeWidth="0.08" strokeDasharray="0.3 0.15" filter="url(#neon-glow)" />
                )}

                {/* Rotated Robot Group (Facing Direction of Travel) */}
                <g transform={`rotate(${angleDeg})`}>
                  {/* Forward Headlight Beam Cone illuminating the floor */}
                  <path
                    d="M 0.45 -0.15 L 1.8 -0.65 L 1.8 0.65 L 0.45 0.15 Z"
                    fill={r.state === "BLOCKED" ? "rgba(245, 158, 11, 0.25)" : `${sc}2a`}
                  />

                  {/* Ground Underglow Halo */}
                  <ellipse cx="0" cy="0" rx="0.55" ry="0.46" fill={`${sc}22`} />

                  {/* 4 Corner Drive Wheels */}
                  {[-0.32, 0.32].map((wx) =>
                    [-0.38, 0.38].map((wy) => (
                      <rect
                        key={`w_${wx}_${wy}`}
                        x={wx - 0.1}
                        y={wy - 0.05}
                        width="0.2"
                        height="0.1"
                        rx="0.03"
                        fill="#030712"
                        stroke="#334155"
                        strokeWidth="0.02"
                      />
                    ))
                  )}

                  {/* Main Octagonal Armored Hull (Titanium Slate Finish) */}
                  <polygon
                    points="0.42,-0.28 0.42,0.28 0.28,0.38 -0.28,0.38 -0.42,0.28 -0.42,-0.28 -0.28,-0.38 0.28,-0.38"
                    fill="#151f32"
                    stroke="#273852"
                    strokeWidth="0.035"
                  />

                  {/* Wraparound Perimeter Neon Status Strip (NEXUS-7 style) */}
                  <polygon
                    points="0.38,-0.24 0.38,0.24 0.24,0.34 -0.24,0.34 -0.38,0.24 -0.38,-0.24 -0.24,-0.34 0.24,-0.34"
                    fill="#0d1624"
                    stroke={sc}
                    strokeWidth="0.05"
                  />

                  {/* Dual Front Projector Lamps */}
                  <circle cx="0.4" cy="-0.2" r="0.04" fill="#ffffff" />
                  <circle cx="0.4" cy="0.2" r="0.04" fill="#ffffff" />

                  {/* Carried Cargo Box (If Transporting Goods) */}
                  {r.goalLabel?.includes("bay") && (
                    <rect x="-0.25" y="-0.2" width="0.4" height="0.4" rx="0.04" fill="#d97706" stroke="#f59e0b" strokeWidth="0.03" />
                  )}

                  {/* Central Stepped Emerald LiDAR Turret with Spinning Radar Wave */}
                  <circle cx="0" cy="0" r="0.15" fill="#091424" stroke="#10b981" strokeWidth="0.03" />
                  <g className="hz-radar-sweep">
                    <path d="M 0 0 L 0.5 -0.15 A 0.55 0.55 0 0 1 0.5 0.15 Z" fill="rgba(16, 185, 129, 0.45)" />
                  </g>
                  <circle cx="0" cy="0" r="0.06" fill="#10b981" />
                </g>

                {/* Upright Floating Robot ID Badge (Always Legible) */}
                <g transform="translate(0, -0.65)">
                  <rect x="-0.55" y="-0.2" width="1.1" height="0.4" rx="0.08" fill="#0b1322" stroke={sc} strokeWidth="0.035" />
                  <circle cx="-0.35" cy="0" r="0.05" fill={sc} />
                  <text x="0.08" y="0.08" fontSize="0.24" fontWeight="800" textAnchor="middle" fill="#f8fafc" fontFamily={MONO}>
                    {r.id.replace("amr_", "R")}
                  </text>
                </g>

                {/* Battery Status Indicator Bar */}
                <g transform="translate(0, 0.65)">
                  <rect x="-0.35" y="-0.04" width="0.7" height="0.08" rx="0.02" fill="#09101d" />
                  <rect
                    x="-0.35"
                    y="-0.04"
                    width={0.7 * (Math.max(5, r.battery) / 100)}
                    height="0.08"
                    rx="0.02"
                    fill={r.battery > 50 ? "#10b981" : r.battery > 25 ? "#f59e0b" : "#ef4444"}
                  />
                </g>
              </g>
            );
          })}
        </svg>

        {/* Hazard Drawing Overlay with Non-Blocking Controls */}
        <HazardDrawingOverlay
          world={DEMO_WORLD}
          robots={robots}
          hazards={hazards}
          onCommit={addHazard}
          onDeleteHazard={deleteHazard}
          onClearHazards={clearHazards}
        />

        {/* Interactive Hover Telemetry HUD for Robots */}
        {hoveredRobot && (
          <div
            className="hz-glass"
            style={{
              top: 10,
              right: 12,
              minWidth: 220,
              background: "rgba(9, 15, 28, 0.92)",
              border: `1px solid ${STATE_COLOR[hoveredRobot.state]}88`,
              boxShadow: `0 0 24px -6px ${STATE_COLOR[hoveredRobot.state]}66`,
              zIndex: 40
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontWeight: 800, fontSize: 13, color: "#f8fafc" }}>{hoveredRobot.id.toUpperCase()}</span>
              <span style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 4,
                background: `${STATE_COLOR[hoveredRobot.state]}25`,
                color: STATE_COLOR[hoveredRobot.state],
                fontWeight: 700
              }}>
                {hoveredRobot.state}
              </span>
            </div>
            <div className="hz-mono" style={{ display: "grid", gap: 4, fontSize: 11.5, color: "#94a3b8" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Battery</span>
                <span style={{ color: "#f8fafc", fontWeight: 600 }}>{hoveredRobot.battery}%</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Speed</span>
                <span style={{ color: "#f8fafc" }}>{hoveredRobot.speed || 1.2} m/s</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>Destination</span>
                <span style={{ color: "#38bdf8" }}>{hoveredRobot.goalLabel || "Dock Bay"}</span>
              </div>
              {hoveredRobot.yieldingTo && (
                <div style={{ display: "flex", justifyContent: "space-between", color: "#f59e0b" }}>
                  <span>Yielding To</span>
                  <span>{hoveredRobot.yieldingTo}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Natural Intent Command Bar at the Bottom */}
      <NaturalCommandBar world={ctx} onAction={onAction} onHighlight={onHighlight} />
    </div>
  );
}
