/**
 * SwarmEdge — Block 2: Fleet Utilization Gantt & Carbon Impact Engine
 *
 * Exports: <FleetGanttTimeline data /> and <SustainabilityPanel data />
 *          useFleetSimulator() (demo feed), computeEnergy() (pure model), MODEL (assumptions)
 *
 * DATA CONTRACT (swap the simulator for your live feed):
 * data = {
 *   now: 1730000000000,                     // ms epoch
 *   windowMs: 300000,                       // rolling window (5 min)
 *   history: { amr_01: [{ state, start, end|null, node }] },   // end=null => open segment
 *   telemetry: { amr_01: { moveS, payloadKgS, idleS, waitS, restarts,
 *                          contentions, distanceM, pods } }    // cumulative counters
 * }
 * State aliases MOVING / CONTENTION / RESOLVING are normalised automatically.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";

/* ───────────────────────── constants ───────────────────────── */
export const STATE_META = {
  EN_ROUTE: { label: "En route", color: "#10b981" },
  WAITING_FOR_LEASE: { label: "Waiting for lease", color: "#f59e0b" },
  CROSSING_INTERSECTION: { label: "Crossing intersection", color: "#06b6d4" },
  BACKING_OFF: { label: "Backing off", color: "#a855f7" },
  IDLE: { label: "Idle", color: "#64748b" },
};
const ALIAS = { MOVING: "EN_ROUTE", CONTENTION: "WAITING_FOR_LEASE", RESOLVING: "BACKING_OFF" };
const norm = (s) => ALIAS[s] || s;
const isMoving = (s) => s === "EN_ROUTE" || s === "CROSSING_INTERSECTION";

// Modelling assumptions — tune to your AMR spec sheet. Shown to judges in the panel footer.
export const MODEL = {
  P_MOVE_W: 60, // base drive power while moving
  P_PAYLOAD_W_PER_KG: 0.35, // extra drive power per kg carried
  P_IDLE_W: 18, // standby / waiting draw
  ROBOT_KG: 150,
  CRUISE_MS: 1.2, // cruise speed, m/s
  DRIVE_EFF: 0.6, // drivetrain efficiency for acceleration energy
  BASE_WAIT_MULT: 2.4, // centralized stop-and-wait queues ≈2.4× longer waits
  BASE_EXTRA_STOPS: 1.2, // extra hard stops per contention event in baseline
  BASE_HARD_BRAKE_MULT: 1.35, // harsher accel profile after a hard brake
  GRID_KG_PER_KWH: 0.71, // approx. India grid average; override via gridFactor prop
  SHIFT_HOURS: 20,
  DAYS: 330,
};

/* ───────────────────────── energy model ───────────────────────── */
export function computeEnergy(telemetry, { gridFactor = MODEL.GRID_KG_PER_KWH } = {}) {
  const M = MODEL;
  const t = { moveS: 0, payloadKgS: 0, idleS: 0, waitS: 0, restarts: 0, contentions: 0, distanceM: 0, pods: 0 };
  const robots = Object.values(telemetry);
  robots.forEach((r) => Object.keys(t).forEach((k) => (t[k] += r[k] || 0)));

  const avgPayload = t.moveS ? t.payloadKgS / t.moveS : 0;
  const perRestartWh = (0.5 * (M.ROBOT_KG + avgPayload) * M.CRUISE_MS ** 2) / M.DRIVE_EFF / 3600;
  const moveWh = (M.P_MOVE_W * t.moveS + M.P_PAYLOAD_W_PER_KG * t.payloadKgS) / 3600;

  const swarm = {
    move: moveWh,
    accel: t.restarts * perRestartWh,
    idle: (M.P_IDLE_W * (t.idleS + t.waitS)) / 3600,
  };
  const base = {
    move: moveWh, // same route, same payload
    accel: (t.restarts + t.contentions * M.BASE_EXTRA_STOPS) * perRestartWh * M.BASE_HARD_BRAKE_MULT,
    idle: (M.P_IDLE_W * (t.idleS + t.waitS * M.BASE_WAIT_MULT)) / 3600,
  };
  const sum = (o) => o.move + o.accel + o.idle;
  const swarmWh = sum(swarm);
  const baseWh = sum(base);
  const savedKwh = (baseWh - swarmWh) / 1000;
  const robotS = t.moveS + t.idleS + t.waitS;

  return {
    swarm, base, swarmWh, baseWh, savedKwh,
    co2Kg: savedKwh * gridFactor,
    gainPct: swarmWh ? (baseWh / swarmWh - 1) * 100 : 0, // extra pods per battery charge
    waitAvoidedS: t.waitS * (M.BASE_WAIT_MULT - 1),
    distanceM: t.distanceM,
    pods: t.pods,
    robots: robots.length,
    robotS,
  };
}

/* ───────────────────────── demo simulator ───────────────────────── */
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const DUR = {
  EN_ROUTE: [8, 25], WAITING_FOR_LEASE: [2, 7], CROSSING_INTERSECTION: [2, 4],
  BACKING_OFF: [1, 3], IDLE: [5, 18],
};
function nextState(s) {
  const r = Math.random();
  switch (s) {
    case "IDLE": return "EN_ROUTE";
    case "EN_ROUTE": return r < 0.5 ? "CROSSING_INTERSECTION" : r < 0.88 ? "WAITING_FOR_LEASE" : "IDLE";
    case "WAITING_FOR_LEASE": return r < 0.15 ? "BACKING_OFF" : "CROSSING_INTERSECTION";
    case "BACKING_OFF": return r < 0.6 ? "WAITING_FOR_LEASE" : "EN_ROUTE";
    default: return r < 0.8 ? "EN_ROUTE" : "IDLE";
  }
}
function openSeg(sim, id, state, t) {
  const h = sim.history[id], c = sim.cur[id], tel = sim.tele[id];
  const last = h[h.length - 1];
  if (last) last.end = t;
  const prev = last && last.state;
  if (isMoving(state) && !isMoving(prev)) tel.restarts++;
  if (state === "WAITING_FOR_LEASE") tel.contentions++;
  if (state === "EN_ROUTE" && prev === "IDLE") {
    c.payload = pick([0, 60, 120, 180]);
    tel.pods += c.payload / 60;
  }
  h.push({ state, start: t, end: null, node: "N-" + String(1 + Math.floor(Math.random() * 24)).padStart(2, "0") });
  c.endAt = t + rnd(...DUR[state]) * 1000;
}
function advance(sim, to, windowMs) {
  const dt = (to - sim.now) / 1000;
  for (const id in sim.history) {
    const h = sim.history[id], s = h[h.length - 1].state, tel = sim.tele[id], c = sim.cur[id];
    if (isMoving(s)) { tel.moveS += dt; tel.payloadKgS += c.payload * dt; tel.distanceM += MODEL.CRUISE_MS * dt; }
    else if (s === "WAITING_FOR_LEASE") tel.waitS += dt;
    else tel.idleS += dt;
    if (to >= c.endAt) openSeg(sim, id, nextState(s), to);
    while (h.length > 1 && h[0].end < to - windowMs - 30000) h.shift();
  }
  sim.now = to;
}
function createSim(n, seedMs, windowMs) {
  const end = Date.now();
  const sim = { now: end - seedMs, history: {}, tele: {}, cur: {} };
  for (let i = 1; i <= n; i++) {
    const id = `amr_${String(i).padStart(2, "0")}`;
    sim.history[id] = [];
    sim.tele[id] = { moveS: 0, payloadKgS: 0, idleS: 0, waitS: 0, restarts: 0, contentions: 0, distanceM: 0, pods: 0 };
    sim.cur[id] = { payload: 0, endAt: 0 };
    openSeg(sim, id, "IDLE", sim.now);
  }
  for (let t = sim.now + 250; t <= end; t += 250) advance(sim, t, windowMs);
  return sim;
}
export function useFleetSimulator({ robots = 6, windowMs = 300000 } = {}) {
  const ref = useRef(null);
  if (!ref.current) ref.current = createSim(robots, windowMs, windowMs);
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { advance(ref.current, Date.now(), windowMs); tick((x) => x + 1); }, 250);
    return () => clearInterval(id);
  }, [windowMs]);
  const s = ref.current;
  return { now: s.now, windowMs, history: s.history, telemetry: s.tele };
}

/* ───────────────────────── shared UI ───────────────────────── */
const MONO = `"JetBrains Mono","SF Mono",ui-monospace,Menlo,Consolas,monospace`;
const CSS = `
.se-card{position:relative;padding:20px 22px;border-radius:20px;color:#e2e8f0;
  background:linear-gradient(145deg,rgba(30,41,59,.62),rgba(15,23,42,.5));
  backdrop-filter:blur(18px) saturate(140%);-webkit-backdrop-filter:blur(18px) saturate(140%);
  border:1px solid rgba(255,255,255,.09);
  box-shadow:0 24px 60px -24px rgba(0,0,0,.75),inset 0 1px 0 rgba(255,255,255,.07);
  font-family:system-ui,-apple-system,"Segoe UI",sans-serif;box-sizing:border-box}
.se-card *{box-sizing:border-box}
.se-mono{font-family:${MONO};font-variant-numeric:tabular-nums}
.se-h{margin:0;font-size:16px;font-weight:600}
.se-sub{margin:3px 0 0;font-size:12.5px;color:#94a3b8;line-height:1.4}
.se-bar{height:6px;border-radius:99px;background:rgba(148,163,184,.14);overflow:hidden}
.se-bar>i{display:block;height:100%;border-radius:inherit;background:var(--c);
  box-shadow:0 0 8px var(--c),0 0 20px var(--c);transition:width .35s ease}
.se-track{position:relative;height:28px;border-radius:8px;background:rgba(2,6,23,.45);overflow:hidden}
.se-seg{position:absolute;top:3px;bottom:3px;border-radius:5px;background:var(--c);
  box-shadow:0 0 10px -2px var(--c);border-right:1px solid rgba(2,6,23,.55);cursor:crosshair}
.se-seg:hover{filter:brightness(1.25)}
.se-btn{appearance:none;cursor:pointer;font:600 13px system-ui,sans-serif;color:#052e2b;border:0;
  padding:10px 16px;border-radius:12px;background:linear-gradient(135deg,#34d399,#22d3ee);
  box-shadow:0 0 22px rgba(52,211,153,.4)}
.se-btn.ghost{color:#e2e8f0;background:rgba(148,163,184,.14);box-shadow:none}
.se-btn:focus-visible,.se-tab:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}
.se-tab{appearance:none;cursor:pointer;border:0;padding:6px 12px;font:500 12px system-ui,sans-serif;
  color:#94a3b8;background:transparent;border-radius:8px}
.se-tab[aria-pressed="true"]{color:#e2e8f0;background:rgba(148,163,184,.2)}
.se-grid{display:grid;gap:14px}
@media (prefers-reduced-motion:reduce){.se-bar>i{transition:none}}
`;
const Styles = () => <style>{CSS}</style>;

const GlowBar = ({ pct, color }) => (
  <div className="se-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
    <i style={{ "--c": color, width: `${Math.max(0, Math.min(100, pct))}%` }} />
  </div>
);
const Stat = ({ label, value, unit, color, size = 30, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>{label}</div>
    <div className="se-mono" style={{ fontSize: size, fontWeight: 600, color, textShadow: `0 0 18px ${color}66`, lineHeight: 1 }}>
      {value}<span style={{ fontSize: size * 0.42, color: "#94a3b8", marginLeft: 6, fontWeight: 400 }}>{unit}</span>
    </div>
    {children && <div style={{ marginTop: 10 }}>{children}</div>}
  </div>
);
const fmtClock = (ms) => new Date(ms).toLocaleTimeString([], { hour12: false });
const fmtKwh = (v) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toFixed(4));

/* ───────────────────────── 1. Gantt ───────────────────────── */
export function FleetGanttTimeline({ data }) {
  const { now, windowMs, history } = data;
  const [tip, setTip] = useState(null);
  const from = now - windowMs;

  const { rows, kpi } = useMemo(() => {
    let active = 0, total = 0, waitMs = 0;
    const rows = Object.entries(history).map(([id, segs]) => {
      const out = [], tot = {};
      segs.forEach((sg) => {
        const s = Math.max(sg.start, from), e = Math.min(sg.end ?? now, now);
        if (e <= s) return;
        const st = norm(sg.state);
        out.push({ ...sg, state: st, s, e, full: (sg.end ?? now) - sg.start });
        tot[st] = (tot[st] || 0) + (e - s);
      });
      const sum = Object.values(tot).reduce((a, b) => a + b, 0);
      const act = (tot.EN_ROUTE || 0) + (tot.CROSSING_INTERSECTION || 0);
      active += act; total += sum; waitMs += tot.WAITING_FOR_LEASE || 0;
      return { id, out, idlePct: sum ? ((tot.IDLE || 0) / sum) * 100 : 0 };
    });
    return {
      rows,
      kpi: {
        util: total ? (active / total) * 100 : 0,
        avoidedS: (waitMs / 1000) * (MODEL.BASE_WAIT_MULT - 1),
        avgIdle: rows.length ? rows.reduce((a, r) => a + r.idlePct, 0) / rows.length : 0,
      },
    };
  }, [history, now, from]);

  const showTip = (e, seg, id) => setTip({ x: e.clientX, y: e.clientY, seg, id });

  return (
    <section className="se-card" aria-label="Fleet state timeline">
      <Styles />
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h2 className="se-h">Fleet state timeline</h2>
          <p className="se-sub">Rolling {Math.round(windowMs / 60000)}-minute window, one row per robot</p>
        </div>
        <ul style={{ display: "flex", gap: 14, flexWrap: "wrap", listStyle: "none", margin: 0, padding: 0, fontSize: 12, color: "#cbd5e1" }}>
          {Object.entries(STATE_META).map(([k, m]) => (
            <li key={k} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color, boxShadow: `0 0 8px ${m.color}` }} />
              {m.label}
            </li>
          ))}
        </ul>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", rowGap: 8, columnGap: 10, alignItems: "center" }}>
        {rows.map((r) => (
          <React.Fragment key={r.id}>
            <span className="se-mono" style={{ fontSize: 12, color: "#cbd5e1" }}>{r.id}</span>
            <div className="se-track" onMouseLeave={() => setTip(null)}>
              {r.out.map((sg, i) => (
                <div
                  key={sg.start + "-" + i}
                  className="se-seg"
                  aria-label={`${r.id} ${STATE_META[sg.state]?.label} at ${sg.node}`}
                  style={{
                    "--c": STATE_META[sg.state]?.color || "#64748b",
                    left: `${((sg.s - from) / windowMs) * 100}%`,
                    width: `${((sg.e - sg.s) / windowMs) * 100}%`,
                  }}
                  onMouseEnter={(e) => showTip(e, sg, r.id)}
                  onMouseMove={(e) => showTip(e, sg, r.id)}
                />
              ))}
            </div>
          </React.Fragment>
        ))}
        <span />
        <div className="se-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b" }}>
          {["-5m", "-4m", "-3m", "-2m", "-1m", "now"].map((t) => <span key={t}>{t}</span>)}
        </div>
      </div>

      {tip && (
        <div
          role="tooltip"
          className="se-mono"
          style={{
            position: "fixed", left: Math.min(tip.x + 14, window.innerWidth - 210), top: tip.y + 14, zIndex: 50,
            width: 190, padding: "10px 12px", borderRadius: 12, fontSize: 12, lineHeight: 1.6, pointerEvents: "none",
            background: "rgba(2,6,23,.92)", border: `1px solid ${STATE_META[tip.seg.state]?.color}88`,
            boxShadow: `0 0 20px ${STATE_META[tip.seg.state]?.color}44`, color: "#e2e8f0",
          }}
        >
          <div style={{ color: STATE_META[tip.seg.state]?.color, fontWeight: 600 }}>{STATE_META[tip.seg.state]?.label}</div>
          <div>{tip.id}</div>
          <div>Start {fmtClock(tip.seg.start)}</div>
          <div>Duration {(tip.seg.full / 1000).toFixed(1)}s</div>
          <div>Node {tip.seg.node}</div>
        </div>
      )}

      <div className="se-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginTop: 22, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        <Stat label="Fleet utilization" value={kpi.util.toFixed(1)} unit="%" color="#10b981">
          <GlowBar pct={kpi.util} color="#10b981" />
        </Stat>
        <Stat label="Contention wait avoided" value={kpi.avoidedS.toFixed(0)} unit="s" color="#f59e0b">
          <GlowBar pct={Math.min(100, kpi.avoidedS / 3)} color="#f59e0b" />
        </Stat>
        <Stat label="Average idle" value={kpi.avgIdle.toFixed(1)} unit="%" color="#94a3b8">
          <GlowBar pct={kpi.avgIdle} color="#64748b" />
        </Stat>
      </div>

      <div className="se-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(130px,1fr))", marginTop: 18 }}>
        {rows.map((r) => (
          <div key={r.id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 5, color: "#94a3b8" }}>
              <span className="se-mono">{r.id}</span>
              <span className="se-mono" style={{ color: "#cbd5e1" }}>{r.idlePct.toFixed(1)}% idle</span>
            </div>
            <GlowBar pct={r.idlePct} color="#64748b" />
          </div>
        ))}
      </div>
      <p className="se-sub" style={{ marginTop: 14 }}>
        Utilization counts en route and crossing time as active. Wait avoided compares actual lease waits with a
        centralized stop-and-wait baseline ({MODEL.BASE_WAIT_MULT}× longer queues, an assumption).
      </p>
    </section>
  );
}

/* ───────────────────────── 2. Sustainability ───────────────────────── */
export function SustainabilityPanel({ data, gridFactor = MODEL.GRID_KG_PER_KWH }) {
  const [scope, setScope] = useState("session");
  const [pitch, setPitch] = useState(false);
  const [copied, setCopied] = useState(false);
  const E = useMemo(() => computeEnergy(data.telemetry, { gridFactor }), [data.now, data.telemetry, gridFactor]);

  const k = scope === "annual" && E.robotS ? (E.robots * MODEL.SHIFT_HOURS * 3600 * MODEL.DAYS) / E.robotS : 1;
  const saved = E.savedKwh * k, co2 = E.co2Kg * k, gain = E.gainPct;
  const scopeLabel = scope === "annual" ? `per year (${E.robots} robots, ${MODEL.SHIFT_HOURS} h/day, ${MODEL.DAYS} days)` : "this session";

  useEffect(() => {
    if (!pitch) return;
    const onKey = (e) => e.key === "Escape" && setPitch(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pitch]);

  const summary =
    `SwarmEdge decentralized reservation vs centralized stop-and-wait, ${scopeLabel}: ` +
    `${fmtKwh(saved)} kWh saved, ${co2 >= 100 ? co2.toFixed(0) : co2.toFixed(3)} kg CO2e avoided ` +
    `(${gridFactor} kg/kWh), +${gain.toFixed(1)}% throughput per battery cycle.`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(summary); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (_) {}
  };

  const parts = [["move", "Driving + payload", "#10b981"], ["accel", "Acceleration", "#06b6d4"], ["idle", "Idle + queue wait", "#f59e0b"]];
  const maxWh = Math.max(E.baseWh, 1e-9);

  return (
    <section className="se-card" aria-label="Energy and carbon savings">
      <Styles />
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <div>
          <h2 className="se-h">Energy and CO₂ savings</h2>
          <p className="se-sub">SwarmEdge vs centralized stop-and-wait, {scopeLabel}</p>
        </div>
        <div style={{ display: "flex", gap: 4, alignSelf: "flex-start", padding: 3, borderRadius: 11, background: "rgba(2,6,23,.4)" }}>
          <button className="se-tab" aria-pressed={scope === "session"} onClick={() => setScope("session")}>Session</button>
          <button className="se-tab" aria-pressed={scope === "annual"} onClick={() => setScope("annual")}>Annual projection</button>
        </div>
      </header>

      <div className="se-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))" }}>
        <Stat label="Energy saved" value={fmtKwh(saved)} unit="kWh" color="#10b981" size={34}>
          <GlowBar pct={E.baseWh ? ((E.baseWh - E.swarmWh) / E.baseWh) * 400 : 0} color="#10b981" />
        </Stat>
        <Stat label="Carbon avoided" value={co2 >= 100 ? co2.toFixed(0) : co2.toFixed(3)} unit="kg CO₂e" color="#06b6d4" size={34}>
          <GlowBar pct={E.baseWh ? ((E.baseWh - E.swarmWh) / E.baseWh) * 400 : 0} color="#06b6d4" />
        </Stat>
        <Stat label="Throughput per battery cycle" value={`+${gain.toFixed(1)}`} unit="%" color="#a855f7" size={34}>
          <GlowBar pct={gain * 4} color="#a855f7" />
        </Stat>
      </div>

      <div style={{ marginTop: 24, paddingTop: 18, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        {[["SwarmEdge", E.swarm, E.swarmWh, "#10b981"], ["Centralized baseline", E.base, E.baseWh, "#f59e0b"]].map(([name, p, wh, c]) => (
          <div key={name} style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span>{name}</span>
              <span className="se-mono" style={{ color: c }}>{fmtKwh((wh * k) / 1000)} kWh</span>
            </div>
            <GlowBar pct={(wh / maxWh) * 100} color={c} />
            <div className="se-mono" style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6, fontSize: 11, color: "#94a3b8" }}>
              {parts.map(([key, label, pc]) => (
                <span key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <i style={{ width: 7, height: 7, borderRadius: 2, background: pc }} />
                  {label} {((p[key] * k) / 1000).toFixed(scope === "annual" ? 1 : 4)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="se-mono" style={{ fontSize: 12, color: "#94a3b8" }}>
          {E.distanceM.toFixed(0)} m driven · {E.pods.toFixed(0)} pods moved
        </div>
        <button className="se-btn" onClick={() => setPitch(true)}>Judge pitch export</button>
      </div>
      <p className="se-sub" style={{ marginTop: 14 }}>
        Model: {MODEL.P_MOVE_W} W drive + {MODEL.P_PAYLOAD_W_PER_KG} W/kg payload, {MODEL.P_IDLE_W} W idle, kinetic restart cost
        at {MODEL.CRUISE_MS} m/s, baseline {MODEL.BASE_WAIT_MULT}× longer waits and {MODEL.BASE_EXTRA_STOPS} extra hard stops per
        contention. Grid factor {gridFactor} kg CO₂/kWh. These are estimates, not measurements.
      </p>

      {pitch && (
        <div
          role="dialog" aria-modal="true" aria-label="Pitch summary" onClick={() => setPitch(false)}
          style={{ position: "fixed", inset: 0, zIndex: 100, display: "grid", placeItems: "center", padding: 24, background: "rgba(2,6,23,.82)", backdropFilter: "blur(8px)" }}
        >
          <div className="se-card" onClick={(e) => e.stopPropagation()} style={{ width: "min(880px,100%)", padding: 36 }}>
            <h2 className="se-h" style={{ fontSize: 22 }}>SwarmEdge impact</h2>
            <p className="se-sub" style={{ fontSize: 14 }}>Decentralized reservation vs centralized stop-and-wait, {scopeLabel}</p>
            <div className="se-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", margin: "34px 0" }}>
              <Stat label="Energy saved" value={fmtKwh(saved)} unit="kWh" color="#10b981" size={52} />
              <Stat label="Carbon avoided" value={co2 >= 100 ? co2.toFixed(0) : co2.toFixed(3)} unit="kg CO₂e" color="#06b6d4" size={52} />
              <Stat label="Throughput per battery cycle" value={`+${gain.toFixed(1)}`} unit="%" color="#a855f7" size={52} />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="se-btn" onClick={copy}>{copied ? "Copied" : "Copy summary"}</button>
              <button className="se-btn ghost" onClick={() => setPitch(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ───────────────────────── demo ───────────────────────── */
export default function SwarmEdgeBlock2Demo() {
  const data = useFleetSimulator({ robots: 6, windowMs: 300000 });
  return (
    <div style={{ minHeight: "100vh", padding: 24, background: "radial-gradient(circle at 15% 10%,#0f2a3a 0%,#0b1220 45%,#050810 100%)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", display: "grid", gap: 20 }}>
        <FleetGanttTimeline data={data} />
        <SustainabilityPanel data={data} />
      </div>
    </div>
  );
}
