import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { LANGS, setLang, useLang, useT, load, save } from "./i18n";

/* ---------- Enhanced Cyber Industrial Mesh Styles ---------- */
const CSS = `
.se {
  --bg: #070b12;
  --panel: #09111c;
  --line: #172640;
  --cyan: #0ea5e9;
  --green: #10b981;
  --red: #ef4444;
  --amber: #f59e0b;
  --text: #e2e8f0;
  --mute: #7d8ba1;
  font-family: "Noto Sans Devanagari", "Nirmala UI", "Inter", system-ui, sans-serif;
  line-height: 1.5;
  color: var(--text);
}
.se * { box-sizing: border-box; min-width: 0; }
.se-panel {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.06);
}
.se-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 16px;
  justify-content: space-between;
  margin-bottom: 14px;
}
.se-title-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}
.se-title-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: #0c1a2e;
  border: 1px solid rgba(14,165,233,0.4);
  box-shadow: 0 0 12px rgba(14,165,233,0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cyan);
  font-size: 15px;
}
.se-title {
  font-size: 15px;
  font-weight: 700;
  margin: 0;
  letter-spacing: -0.01em;
  color: #fff;
}
.se-subtitle {
  font-size: 11px;
  color: var(--mute);
  font-mono: monospace;
}
.se-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
.se-chip {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 3px 12px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  border: 1px solid var(--line);
  background: var(--panel);
}
.se-chip.ok { color: var(--green); border-color: rgba(16,185,129,0.35); background: rgba(16,185,129,0.08); }
.se-chip.bad { color: var(--red); border-color: rgba(239,68,68,0.45); background: rgba(239,68,68,0.1); }
.se-chip.cy { color: var(--cyan); border-color: rgba(14,165,233,0.35); background: rgba(14,165,233,0.08); }

.se-switch {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  background: linear-gradient(145deg, #131d2e 0%, #0c1422 100%);
  color: #f1f5f9;
  border: 1px solid #1e324d;
  border-radius: 999px;
  padding: 4px 14px 4px 6px;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.se-switch:hover {
  border-color: rgba(56,189,248,0.6);
  box-shadow: 0 0 14px rgba(56,189,248,0.3);
}
.se-switch:focus-visible, .se-lang button:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}
.se-switch i {
  width: 32px;
  height: 18px;
  border-radius: 99px;
  background: #172438;
  position: relative;
  flex: none;
  transition: background 0.25s;
  box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
}
.se-switch i::after {
  content: "";
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--mute);
  transition: transform 0.25s, background 0.25s, box-shadow 0.25s;
}
.se-switch[aria-checked=true] i {
  background: rgba(239,68,68,0.35);
}
.se-switch[aria-checked=true] i::after {
  transform: translateX(14px);
  background: var(--red);
  box-shadow: 0 0 8px #ef4444;
}

.se-lang {
  display: inline-flex;
  flex-wrap: wrap;
  border: 1px solid #1e324d;
  border-radius: 8px;
  overflow: hidden;
  background: #09111c;
}
.se-lang button {
  background: none;
  border: 0;
  color: var(--mute);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 11px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.se-lang button:hover {
  color: #fff;
}
.se-lang button[aria-checked=true] {
  background: #0284c7;
  color: #fff;
  font-weight: 700;
  box-shadow: 0 0 10px rgba(2,132,199,0.5);
}

.se-badge {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  font-size: 11.5px;
  font-weight: 600;
  padding: 3px 11px;
  border-radius: 999px;
  border: 1px solid;
}
.se-badge i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 6px currentColor;
}
.se-badge.ok {
  color: var(--green);
  border-color: rgba(16,185,129,0.35);
  background: rgba(16,185,129,0.1);
}
.se-badge.off {
  color: var(--cyan);
  border-color: rgba(14,165,233,0.5);
  background: rgba(14,165,233,0.12);
}

.se-groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.se-grp {
  background: var(--panel);
  border: 1px solid var(--line);
  border-left: 3.5px solid var(--g);
  border-radius: 10px;
  padding: 12px 14px;
  font-size: 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}
.se-grp h4 {
  margin: 0 0 5px;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--g);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.se-grp ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  color: var(--mute);
  font-family: monospace;
  font-size: 11px;
}
.se-grp li {
  padding: 2.5px 0;
  border-bottom: 1px dashed rgba(255,255,255,0.05);
}
.se-grp .m {
  color: var(--mute);
  font-size: 11px;
  margin-top: 2px;
}

.se-flow {
  stroke-dasharray: 4 8;
  animation: se-flow 1.2s linear infinite;
}
@keyframes se-flow {
  to { stroke-dashoffset: -24; }
}
.se-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: se-pulse 1.4s ease-out infinite;
}
@keyframes se-pulse {
  0% { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(1.8); opacity: 0; }
}
.se-hull {
  animation: se-in 0.4s ease both;
}
@keyframes se-in {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}
@media (prefers-reduced-motion: reduce) {
  .se-flow, .se-ring, .se-hull { animation: none; }
}
`;

if (typeof document !== "undefined" && !document.getElementById("se-block1-css")) {
  const s = document.createElement("style");
  s.id = "se-block1-css";
  s.textContent = CSS;
  document.head.appendChild(s);
  const l = document.createElement("link");
  l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+Devanagari:wght@400;600;700&display=swap";
  document.head.appendChild(l);
}

/* ---------- persistence + PWA helpers ---------- */
export function usePersistentState(key, init) {
  const [v, setV] = useState(() => load(key, init));
  useEffect(() => { save(key, v); }, [key, v]);
  return [v, setV];
}

export function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    });
  }
}

const useOnline = () =>
  useSyncExternalStore(
    (cb) => {
      addEventListener("online", cb);
      addEventListener("offline", cb);
      return () => {
        removeEventListener("online", cb);
        removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true
  );

/* ---------- LanguageToggle / OfflineIndicator ---------- */
export function LanguageToggle() {
  const lang = useLang();
  const t = useT();
  return (
    <div className="se se-lang" role="radiogroup" aria-label={t("language")}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          role="radio"
          aria-checked={lang === l.code}
          onClick={() => setLang(l.code)}
          title={`Switch language to ${l.name}`}
        >
          {l.name}
        </button>
      ))}
    </div>
  );
}

export function OfflineIndicator() {
  const online = useOnline();
  const t = useT();
  return (
    <span className={`se se-badge ${online ? "ok" : "off"}`} role="status">
      <i />
      {online ? t("online") : t("offline")}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  MeshTopologyPanel: Enhanced SVG Canvas                                     */
/* -------------------------------------------------------------------------- */

const W = 960;
const H = 460;
const NAMES = ["AMR-01", "AMR-02", "AMR-03", "AMR-04", "AMR-05", "AMR-06"];
const ROLES = ["LEADER", "ARBITER", "PEER", "LEADER", "ARBITER", "PEER"];
const EDGES = [
  [0, 1], [1, 2], [0, 2], // Cluster Alpha internal links
  [3, 4], [4, 5], [3, 5], // Cluster Beta internal links
  [2, 3], [1, 4], [0, 5], // Cross-cluster partition links
];
const RES = ["aisle-B3", "dock-2", "junction-J4", "charger-1", "lift-A"];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmtAge = (ms) => (ms >= 1000 ? (ms / 1000).toFixed(1) + "s" : Math.round(ms) + "ms");
const col = (c, part) => (part && c === 1 ? "#10b981" : "#0ea5e9");

export function MeshTopologyPanel() {
  const t = useT();
  const [part, setPart] = usePersistentState("se.partition", false);
  const partRef = useRef(part);
  partRef.current = part;

  // Initialize nodes with good initial layout spacing
  const nodes = useRef(
    NAMES.map((_, i) => {
      const isBeta = i >= 3;
      const angle = (i % 3) * ((2 * Math.PI) / 3) - Math.PI / 6;
      const cx = isBeta ? W * 0.74 : W * 0.26;
      return {
        c: isBeta ? 1 : 0,
        x: cx + Math.cos(angle) * 115,
        y: H / 2 + Math.sin(angle) * 115,
        vx: 0,
        vy: 0,
      };
    })
  );

  const [, frame] = useState(0);
  const [met, setMet] = useState(() =>
    EDGES.map(() => ({ lat: rnd(2.4, 7.8), loss: rnd(0.0, 1.8), seen: rnd(8, 85) }))
  );
  const [log, setLog] = usePersistentState("se.meshlog", []);
  const [done, setDone] = usePersistentState("se.resolved", { alpha: 0, beta: 0, mesh: 0 });
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  // Force-directed layout physics
  useEffect(() => {
    let raf;
    const tick = () => {
      const ns = nodes.current;
      const p = partRef.current;

      ns.forEach((a) => {
        // Anchor target center:
        const targetX = p ? (a.c ? W * 0.74 : W * 0.26) : W / 2;
        const targetY = H / 2;
        let fx = (targetX - a.x) * 0.0035;
        let fy = (targetY - a.y) * 0.0035;

        // Repulsion between nodes
        ns.forEach((b) => {
          if (a === b) return;
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy + 1;
          const d = Math.sqrt(d2);
          const r = (p && a.c !== b.c ? 18000 : 7500) / d2;
          fx += (dx / d) * r;
          fy += (dy / d) * r;
        });

        a.vx = (a.vx + fx) * 0.84;
        a.vy = (a.vy + fy) * 0.84;
      });

      // Spring attraction on live edges
      EDGES.forEach(([i, j]) => {
        const a = ns[i];
        const b = ns[j];
        if (p && a.c !== b.c) return; // severed link has zero pull
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const restLen = 170;
        const f = (d - restLen) * 0.018;
        a.vx += (dx / d) * f;
        a.vy += (dy / d) * f;
        b.vx -= (dx / d) * f;
        b.vy -= (dy / d) * f;
      });

      ns.forEach((a) => {
        a.x = clamp(a.x + a.vx, 60, W - 60);
        a.y = clamp(a.y + a.vy, 60, H - 60);
      });

      frame((n) => n + 1);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Live link telemetry updater
  useEffect(() => {
    const id = setInterval(() => {
      setMet((m) =>
        m.map((x, k) => {
          const [a, b] = EDGES[k];
          const cut = partRef.current && nodes.current[a].c !== nodes.current[b].c;
          return cut
            ? { ...x, seen: x.seen + 350 }
            : {
                lat: clamp(x.lat + rnd(-0.6, 0.6), 2.1, 8.2),
                loss: clamp(x.loss + rnd(-0.25, 0.25), 0.0, 1.9),
                seen: rnd(5, 75),
              };
        })
      );
    }, 350);
    return () => clearInterval(id);
  }, []);

  // Consensus lease conflict resolution simulation
  useEffect(() => {
    const id = setInterval(() => {
      const groups = partRef.current
        ? [["alpha", [0, 1, 2]], ["beta", [3, 4, 5]]]
        : [["mesh", [0, 1, 2, 3, 4, 5]]];
      const add = [];
      const inc = {};
      groups.forEach(([g, mem]) => {
        const a = mem[Math.floor(Math.random() * mem.length)];
        let b = a;
        while (b === a) b = mem[Math.floor(Math.random() * mem.length)];
        add.push({
          g,
          t: new Date().toLocaleTimeString([], { hour12: false }),
          s: `${NAMES[a]} ⇄ ${NAMES[b]} · ${RES[Math.floor(Math.random() * RES.length)]} → Granted (${NAMES[Math.min(a, b)]})`,
        });
        inc[g] = 1;
      });
      setLog((l) => [...add, ...l].slice(0, 30));
      setDone((d) => {
        const n = { ...d };
        Object.keys(inc).forEach((g) => (n[g] = (n[g] || 0) + 1));
        return n;
      });
    }, 1300);
    return () => clearInterval(id);
  }, []);

  const ns = nodes.current;
  const groups = part
    ? [["alpha", "clusterAlpha", [0, 1, 2], "#0ea5e9"], ["beta", "clusterBeta", [3, 4, 5], "#10b981"]]
    : [["mesh", "unifiedMesh", [0, 1, 2, 3, 4, 5], "#0ea5e9"]];

  // Calculate cluster center and bounding radii
  const clusterAlphaCenter = {
    x: (ns[0].x + ns[1].x + ns[2].x) / 3,
    y: (ns[0].y + ns[1].y + ns[2].y) / 3,
  };
  const clusterBetaCenter = {
    x: (ns[3].x + ns[4].x + ns[5].x) / 3,
    y: (ns[3].y + ns[4].y + ns[5].y) / 3,
  };

  return (
    <section className="se se-panel" aria-label={t("meshTopology")}>
      {/* Top Header Command Bar */}
      <div className="se-head">
        <div className="se-title-wrap">
          <div className="se-title-icon">((o))</div>
          <div>
            <h3 className="se-title">{t("meshTopology")}</h3>
            <div className="se-subtitle">
              P2P Anti-Entropy Gossip • SIL-4 Decentralized Consensus
            </div>
          </div>
        </div>

        <div className="se-row">
          <span className={`se-chip ${part ? "bad" : "ok"}`}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: part ? "#ef4444" : "#10b981",
                boxShadow: `0 0 6px ${part ? "#ef4444" : "#10b981"}`,
              }}
            />
            {part ? t("partitioned") : t("meshHealthy")}
          </span>

          <span className="se-chip cy">
            <span style={{ color: "#38bdf8" }}>🔒</span>
            {t("noCloud")}
          </span>

          <button
            className="se-switch"
            role="switch"
            aria-checked={part}
            onClick={() => setPart(!part)}
            title="Toggle to partition the mesh network into two isolated sub-swarms"
          >
            <i />
            <span>{t("simulatePartition")}</span>
          </button>
        </div>
      </div>

      {/* Main High-Tech SVG Graph */}
      <div
        style={{
          position: "relative",
          width: "100%",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid #16253b",
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.7)",
          background: "#070b12",
        }}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          role="img"
          aria-label={t("meshTopology")}
          style={{ display: "block" }}
        >
          <defs>
            {/* Blueprint Grid Background Pattern */}
            <pattern id="cyber-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(20, 36, 58, 0.45)" strokeWidth="0.8" />
              <circle cx="0" cy="0" r="1" fill="rgba(56, 189, 248, 0.3)" />
            </pattern>

            {/* Glowing Cluster Halos */}
            <radialGradient id="grad-alpha" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.16" />
              <stop offset="70%" stopColor="#0ea5e9" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="grad-beta" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.16" />
              <stop offset="70%" stopColor="#10b981" stopOpacity="0.04" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </radialGradient>

            {/* Severed Barrier Gradient */}
            <linearGradient id="barrier-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0" />
              <stop offset="50%" stopColor="#ef4444" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
            </linearGradient>

            {/* Circular Clip for AMR Bot Images */}
            <clipPath id="amr-bot-clip">
              <circle cx="0" cy="0" r="23" />
            </clipPath>

            {/* Vignette Gradient for Bot Circles */}
            <radialGradient id="bot-vignette" cx="50%" cy="50%" r="50%">
              <stop offset="65%" stopColor="#000000" stopOpacity="0" />
              <stop offset="100%" stopColor="#050c18" stopOpacity="0.55" />
            </radialGradient>
          </defs>

          {/* Background Grid */}
          <rect width={W} height={H} fill="url(#cyber-grid)" />

          {/* Cluster Enclosure Halos when Partitioned */}
          {part && (
            <>
              {/* Cluster Alpha Enclosure */}
              <g className="se-hull">
                <circle
                  cx={clusterAlphaCenter.x}
                  cy={clusterAlphaCenter.y}
                  r="155"
                  fill="url(#grad-alpha)"
                  stroke="#0ea5e9"
                  strokeOpacity="0.4"
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                />
                <rect
                  x={clusterAlphaCenter.x - 70}
                  y={clusterAlphaCenter.y - 172}
                  width="140"
                  height="26"
                  rx="6"
                  fill="#091424"
                  stroke="#0ea5e9"
                  strokeOpacity="0.7"
                />
                <text
                  x={clusterAlphaCenter.x}
                  y={clusterAlphaCenter.y - 155}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="monospace"
                  fill="#38bdf8"
                >
                  CLUSTER ALPHA
                </text>
              </g>

              {/* Cluster Beta Enclosure */}
              <g className="se-hull">
                <circle
                  cx={clusterBetaCenter.x}
                  cy={clusterBetaCenter.y}
                  r="155"
                  fill="url(#grad-beta)"
                  stroke="#10b981"
                  strokeOpacity="0.4"
                  strokeWidth="1.5"
                  strokeDasharray="6 6"
                />
                <rect
                  x={clusterBetaCenter.x - 68}
                  y={clusterBetaCenter.y - 172}
                  width="136"
                  height="26"
                  rx="6"
                  fill="#061814"
                  stroke="#10b981"
                  strokeOpacity="0.7"
                />
                <text
                  x={clusterBetaCenter.x}
                  y={clusterBetaCenter.y - 155}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="monospace"
                  fill="#34d399"
                >
                  CLUSTER BETA
                </text>
              </g>

              {/* Center Severed Barrier Firewall Curtain */}
              <g className="se-hull">
                <line
                  x1={W / 2}
                  y1={25}
                  x2={W / 2}
                  y2={H - 25}
                  stroke="url(#barrier-grad)"
                  strokeWidth="2.5"
                  strokeDasharray="6 6"
                />
                <rect
                  x={W / 2 - 85}
                  y={H / 2 - 16}
                  width="170"
                  height="32"
                  rx="8"
                  fill="#1a0808"
                  stroke="#ef4444"
                  strokeWidth="1.5"
                  style={{ filter: "drop-shadow(0 0 12px rgba(239, 68, 68, 0.45))" }}
                />
                <text
                  x={W / 2}
                  y={H / 2 + 4}
                  textAnchor="middle"
                  fontSize="10.5"
                  fontWeight="800"
                  fontFamily="monospace"
                  letterSpacing="0.06em"
                  fill="#fca5a5"
                >
                  ⚠️ MESH SEVERED
                </text>
              </g>
            </>
          )}

          {/* Links & Edge Telemetry */}
          {EDGES.map(([i, j], k) => {
            const a = ns[i];
            const b = ns[j];
            const m = met[k];
            const cut = part && a.c !== b.c;

            // Compute midpoint and perpendicular offset for clean badge placement
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            // Stagger badge offsets so badges NEVER collide with lines or nodes
            const badgeOffset = (k % 2 === 0 ? 1 : -1) * 16;
            const bx = mx + nx * badgeOffset;
            const by = my + ny * badgeOffset;

            // For severed cross links, stagger along the X/Y axis
            const cutIndex = k - 6; // 0, 1, 2 for the 3 severed links
            const severedX = mx + (cutIndex === 0 ? -38 : cutIndex === 1 ? 0 : 38);
            const severedY = my + (cutIndex === 0 ? -48 : cutIndex === 1 ? 0 : 48);

            return (
              <g
                key={k}
                onMouseEnter={() => setHoveredEdge(k)}
                onMouseLeave={() => setHoveredEdge(null)}
                style={{ cursor: "pointer" }}
              >
                {cut ? (
                  <>
                    {/* Severed Dashed Line */}
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#ef4444"
                      strokeOpacity="0.45"
                      strokeWidth="2"
                      strokeDasharray="5 7"
                    />

                    {/* Staggered Severed Indicator Badge */}
                    <g transform={`translate(${severedX}, ${severedY})`}>
                      <circle
                        cx="0"
                        cy="0"
                        r="12"
                        fill="#0e0608"
                        stroke="#ef4444"
                        strokeWidth="1.5"
                      />
                      <circle className="se-ring" cx="0" cy="0" r="12" fill="none" stroke="#ef4444" strokeWidth="2" />
                      <text x="0" y="4" textAnchor="middle" fontSize="13" fontWeight="800" fill="#ef4444">
                        ×
                      </text>
                      <rect
                        x="-46"
                        y="16"
                        width="92"
                        height="20"
                        rx="4"
                        fill="#0c0709"
                        stroke="#ef4444"
                        strokeOpacity="0.5"
                      />
                      <text
                        x="0"
                        y="29.5"
                        textAnchor="middle"
                        fontSize="9"
                        fontFamily="monospace"
                        fontWeight="700"
                        fill="#fca5a5"
                      >
                        LOST: {fmtAge(m.seen)}
                      </text>
                    </g>
                  </>
                ) : (
                  <>
                    {/* Active Link Base Line */}
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={col(a.c, part)}
                      strokeOpacity={hoveredEdge === k ? "0.9" : "0.35"}
                      strokeWidth={hoveredEdge === k ? "3" : "1.8"}
                    />

                    {/* Luminous Animated Packet Pulse Flow */}
                    <line
                      className="se-flow"
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={col(a.c, part)}
                      strokeOpacity="0.95"
                      strokeWidth="2.2"
                    />

                    {/* Clean Pill Metric Badge with dark background */}
                    <g transform={`translate(${bx}, ${by})`}>
                      <rect
                        x="-38"
                        y="-10"
                        width="76"
                        height="20"
                        rx="10"
                        fill="#09111c"
                        stroke={hoveredEdge === k ? "#38bdf8" : "#1b2c44"}
                        strokeWidth={hoveredEdge === k ? "1.5" : "1"}
                        style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.5))" }}
                      />
                      <text
                        x="0"
                        y="3.5"
                        textAnchor="middle"
                        fontSize="9.5"
                        fontFamily="monospace"
                        fontWeight="700"
                        fill={m.loss > 1.4 ? "#f59e0b" : "#e2e8f0"}
                      >
                        {m.lat.toFixed(1)}ms · {m.loss.toFixed(1)}%
                      </text>
                    </g>
                  </>
                )}
              </g>
            );
          })}

          {/* Node Render (Circles, Rings, Labels & Battery) */}
          {ns.map((n, i) => {
            const isBeta = n.c === 1;
            const themeCol = col(n.c, part);
            const isHov = hoveredNode === i;

            return (
              <g
                key={i}
                transform={`translate(${n.x}, ${n.y})`}
                onMouseEnter={() => setHoveredNode(i)}
                onMouseLeave={() => setHoveredNode(null)}
                style={{ cursor: "pointer" }}
              >
                {/* Outer Ambient Glow Ring */}
                <circle
                  r={isHov ? 35 : 28}
                  fill={themeCol}
                  fillOpacity={isHov ? 0.3 : 0.08}
                  stroke={themeCol}
                  strokeOpacity={isHov ? 0.85 : 0.35}
                  strokeWidth="1.5"
                  style={{ transition: "all 0.25s ease" }}
                />

                {/* Pulsing Cyber Scanner Ring */}
                <circle
                  className="se-ring"
                  r="27"
                  fill="none"
                  stroke={themeCol}
                  strokeWidth="1.2"
                  strokeDasharray="4 6"
                  style={{ opacity: isHov ? 0.8 : 0.35 }}
                />

                {/* Node Solid Dark Chassis Base */}
                <circle
                  r="23"
                  fill="#060c16"
                  stroke={themeCol}
                  strokeWidth={isHov ? "2.5" : "1.8"}
                  style={{
                    filter: `drop-shadow(0 0 12px ${themeCol}66)`,
                    transition: "all 0.2s ease"
                  }}
                />

                {/* AMR Bot 3D Render Image */}
                <image
                  href={isBeta ? "/amr_bot_beta.jpg" : "/amr_bot.jpg"}
                  x="-23"
                  y="-23"
                  width="46"
                  height="46"
                  clipPath="url(#amr-bot-clip)"
                  preserveAspectRatio="xMidYMid slice"
                  style={{
                    transition: "transform 0.25s ease, filter 0.25s ease",
                    transform: isHov ? "scale(1.08)" : "scale(1)",
                    filter: isHov ? "brightness(1.15) contrast(1.08)" : "brightness(0.96) contrast(1.04)",
                  }}
                />

                {/* Edge Vignette / Gradient Overlay */}
                <circle
                  r="23"
                  fill="url(#bot-vignette)"
                  pointerEvents="none"
                />

                {/* High-Tech Inner Glow Border */}
                <circle
                  r="23"
                  fill="none"
                  stroke={themeCol}
                  strokeWidth={isHov ? "2" : "1.2"}
                  strokeOpacity={isHov ? "1" : "0.75"}
                  pointerEvents="none"
                />

                {/* High-Tech AMR Unit ID Pill Badge at bottom of circle */}
                <g transform="translate(0, 11)">
                  <rect
                    x="-13"
                    y="-6"
                    width="26"
                    height="13"
                    rx="3.5"
                    fill="rgba(5, 11, 20, 0.88)"
                    stroke={themeCol}
                    strokeWidth="0.9"
                    style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.85))" }}
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="900"
                    fontFamily="monospace"
                    fill="#ffffff"
                    letterSpacing="0.05em"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </text>
                </g>

                {/* Status Dot */}
                <circle
                  cx="16"
                  cy="-16"
                  r="4.5"
                  fill="#10b981"
                  stroke="#070b12"
                  strokeWidth="1.5"
                  style={{ filter: "drop-shadow(0 0 6px #10b981)" }}
                />

                {/* High-Contrast Pill Name Tag Below Node */}
                <g transform="translate(0, 36)">
                  <rect
                    x="-34"
                    y="-9"
                    width="68"
                    height="18"
                    rx="5"
                    fill="#080e18"
                    stroke="#1c2d44"
                    strokeWidth="1"
                    style={{ filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}
                  />
                  <text
                    x="0"
                    y="3"
                    textAnchor="middle"
                    fontSize="9.5"
                    fontFamily="monospace"
                    fontWeight="700"
                    fill="#cad6e2"
                  >
                    {NAMES[i]}
                  </text>
                </g>

                {/* Role Pill Above Node */}
                <g transform="translate(0, -33)">
                  <rect
                    x="-24"
                    y="-7"
                    width="48"
                    height="14"
                    rx="4"
                    fill={isBeta ? "rgba(16,185,129,0.15)" : "rgba(14,165,233,0.15)"}
                    stroke={themeCol}
                    strokeOpacity="0.4"
                    strokeWidth="0.8"
                  />
                  <text
                    x="0"
                    y="3.5"
                    textAnchor="middle"
                    fontSize="8"
                    fontFamily="monospace"
                    fontWeight="800"
                    fill={themeCol}
                  >
                    {ROLES[i]}
                  </text>
                </g>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Network Stats Footnote */}
      <div
        className="se-row"
        style={{
          fontSize: 11.5,
          color: "#94a3b8",
          marginTop: 10,
          fontFamily: "monospace",
          justifyContent: "space-between",
          padding: "4px 8px",
        }}
      >
        <div style={{ display: "flex", gap: 16 }}>
          <span>
            {t("latency")}: <strong style={{ color: "#38bdf8" }}>2.4 – 8.1 ms</strong>
          </span>
          <span>
            {t("packetLoss")}: <strong style={{ color: "#34d399" }}>0.0 – 1.8%</strong>
          </span>
          <span>
            Topology: <strong style={{ color: "#f8fafc" }}>6 Nodes · 9 Links</strong>
          </span>
        </div>
        <div style={{ color: "#64748b" }}>
          Decentralized Anti-Entropy • No Broker Overhead
        </div>
      </div>

      {/* Real-Time Partition Consensus Telemetry Cards */}
      <div className="se-groups">
        {groups.map(([g, key, mem, color]) => (
          <div key={g} className="se-grp" style={{ "--g": color }}>
            <h4>
              <span>{t(key)}</span>
              <span
                style={{
                  fontSize: 10.5,
                  padding: "1px 8px",
                  borderRadius: 999,
                  background: `${color}1a`,
                  border: `1px solid ${color}44`,
                  color,
                }}
              >
                {part ? "ISOLATED SUB-SWARM" : "UNIFIED MESH"}
              </span>
            </h4>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#f1f5f9" }}>
              {t("localResolution")}
            </div>
            <div className="m">
              {t("arbiter")}: <strong style={{ color: "#f8fafc" }}>{NAMES[mem[0]]}</strong> · {t("resolved")}:{" "}
              <strong style={{ color: "#34d399" }}>{done[g] || 0} leases</strong> · {t("coordinator")}
            </div>
            <ul>
              {log
                .filter((e) => e.g === g)
                .slice(0, 4)
                .map((e, i) => (
                  <li key={i}>
                    <span style={{ color: "#38bdf8", marginRight: 6 }}>[{e.t}]</span>
                    {e.s}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default MeshTopologyPanel;
