import { useEffect, useRef, useState, useMemo } from "react";
import { useT } from "./i18n";
import Twin3D from "./Twin3D";
import { OrderSlaTracker } from "./OrderSlaTracker";
import {
  STATIONS,
  RACKS,
  PRIO_COLOR,
  useStore,
  isLit,
  getRobots,
  getOrders,
  getFollow,
  getSelected,
  setFollow,
  cycleFollow,
  toggleEstop,
  setInject,
  getSpeedMult,
  setSpeedMult,
  getSelectedStation,
  setSelectedStation,
  selectOrder,
} from "./orderStore";

const CSS = `
.lc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #070b12;
  padding: 12px;
  height: 100%;
  font-family: "Noto Sans Devanagari", "Nirmala UI", Inter, system-ui, sans-serif;
  line-height: 1.4;
  color: #e2e8f0;
}
.lc:fullscreen {
  height: 100vh;
  overflow: auto;
}
.lc:fullscreen .lc-feed {
  max-height: 42vh;
  overflow: auto;
}

/* Header bar with fleet telemetry indicators */
.lc-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  padding: 8px 14px;
  background: #0b1322;
  border: 1px solid #172640;
  border-radius: 8px;
}
.lc-hdr-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.lc-hdr-title {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #38bdf8;
  display: flex;
  align-items: center;
  gap: 6px;
}
.lc-hdr-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
  animation: lcPulse 2s infinite;
}
@keyframes lcPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
.lc-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.lc-chip {
  font-size: 11px;
  font-family: monospace;
  padding: 2px 8px;
  border-radius: 4px;
  background: #070b12;
  border: 1px solid #1e293b;
  color: #94a3b8;
}
.lc-chip strong {
  color: #f8fafc;
}

/* Main visual workspace view */
.lc-view {
  display: flex;
  gap: 10px;
  flex: 1;
  min-height: 380px;
  position: relative;
}

/* Left vertical tool rail */
.lc-rail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 88px;
  flex: none;
}
.lc-rail-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 6px;
  border-bottom: 1px solid #172640;
}
.lc-rail-lbl {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #64748b;
  text-transform: uppercase;
  padding: 0 2px;
}
.lc-rail button {
  background: #0b1322;
  color: #cbd5e1;
  border: 1px solid #172640;
  border-radius: 6px;
  padding: 6px 4px;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  overflow-wrap: anywhere;
  text-align: center;
}
.lc-rail button:hover {
  background: #131f36;
  border-color: #38bdf888;
  color: #f8fafc;
}
.lc-rail button[aria-pressed=true] {
  background: #0ea5e9;
  color: #04121c;
  border-color: #38bdf8;
  font-weight: 800;
  box-shadow: 0 0 10px rgba(14, 165, 233, 0.4);
}
.lc-rail button.speed-btn {
  font-family: monospace;
  font-size: 11px;
  padding: 4px;
}
.lc-rail button.follow-active {
  background: #10b981;
  color: #04121c;
  border-color: #34d399;
  font-weight: 800;
}
.lc-rail button.es {
  border-color: #ef4444;
  color: #ef4444;
  margin-top: auto;
}
.lc-rail button.es:hover {
  background: #450a0a;
  border-color: #f87171;
}
.lc-rail button.es[aria-pressed=true] {
  background: #ef4444;
  color: #ffffff;
  box-shadow: 0 0 14px rgba(239, 68, 68, 0.6);
}
.lc-rail button:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

/* Visualization panes */
.lc-pane {
  flex: 1;
  min-width: 0;
  border: 1px solid #172640;
  border-radius: 10px;
  overflow: hidden;
  position: relative;
  background: #070b12;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.5);
}
.lc-tag {
  position: absolute;
  top: 8px;
  left: 10px;
  z-index: 2;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #38bdf8;
  background: rgba(7, 11, 18, 0.85);
  border: 1px solid #172640;
  padding: 3px 8px;
  border-radius: 5px;
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  gap: 6px;
}
.lc-tag-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #0ea5e9;
}
.lc-hint {
  position: absolute;
  bottom: 8px;
  right: 10px;
  z-index: 2;
  font-size: 10px;
  color: #64748b;
  background: rgba(7, 11, 18, 0.8);
  padding: 2px 8px;
  border-radius: 4px;
  pointer-events: none;
}

/* Emergency Stop Overlay */
.lc-estop {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: rgba(239, 68, 68, 0.16);
  backdrop-filter: blur(2px);
  color: #ef4444;
  font-weight: 900;
  font-size: 26px;
  letter-spacing: 0.1em;
  pointer-events: none;
  text-shadow: 0 0 16px rgba(239, 68, 68, 0.8);
}

@media (max-width: 768px) {
  .lc-view {
    flex-direction: column;
  }
  .lc-rail {
    flex-direction: row;
    flex-wrap: wrap;
    width: auto;
  }
  .lc-rail button {
    flex: 1 1 70px;
  }
}
`;

if (typeof document !== "undefined" && !document.getElementById("lc-css")) {
  const s = document.createElement("style");
  s.id = "lc-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

/* -------------------------------------------------------------------------- */
/*  Tactical 2D Canvas Map with AMR Beams, Radar & Interactive Tooltips       */
/* -------------------------------------------------------------------------- */

function Map2D() {
  const ref = useRef();
  const [hoverInfo, setHoverInfo] = useState(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let raf, w = 0, h = 0;

    const fit = () => {
      const r = cv.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      w = r.width;
      h = r.height;
      cv.width = w * d;
      cv.height = h * d;
      ctx.setTransform(d, 0, 0, d, 0, 0);
    };

    const ro = new ResizeObserver(fit);
    ro.observe(cv);
    fit();

    let mouseX = -999, mouseY = -999;
    const onMouseMove = (e) => {
      const rect = cv.getBoundingClientRect();
      mouseX = e.clientX - rect.left;
      mouseY = e.clientY - rect.top;
    };
    const onMouseLeave = () => {
      mouseX = -999;
      mouseY = -999;
      setHoverInfo(null);
    };

    const onClick = () => {
      const k = Math.min(w / 24, h / 17);
      const X = (x) => w / 2 + x * k;
      const Y = (z) => h / 2 + z * k;

      // Check robots first
      const robots = getRobots();
      for (const r of robots) {
        const rx = X(r.x), ry = Y(r.z);
        if (Math.hypot(mouseX - rx, mouseY - ry) < 0.9 * k) {
          if (getFollow() === r.id) {
            setFollow(null);
          } else {
            setFollow(r.id);
            if (r.order) selectOrder(r.order);
          }
          return;
        }
      }

      // Check stations
      for (const s of STATIONS) {
        const sx = X(s.x), sy = Y(s.z);
        if (Math.hypot(mouseX - sx, mouseY - sy) < 1.3 * k) {
          setSelectedStation(s.id);
          return;
        }
      }
    };

    cv.addEventListener("mousemove", onMouseMove);
    cv.addEventListener("mouseleave", onMouseLeave);
    cv.addEventListener("click", onClick);

    const draw = (t) => {
      const k = Math.min(w / 24, h / 17);
      const X = (x) => w / 2 + x * k;
      const Y = (z) => h / 2 + z * k;

      // Dark sci-fi background
      ctx.fillStyle = "#070b12";
      ctx.fillRect(0, 0, w, h);

      // Cyber Grid
      ctx.strokeStyle = "#0e1828";
      ctx.lineWidth = 1;
      for (let i = -11; i <= 11; i++) {
        ctx.beginPath();
        ctx.moveTo(X(i), Y(-8));
        ctx.lineTo(X(i), Y(8));
        ctx.stroke();
      }
      for (let i = -8; i <= 8; i++) {
        ctx.beginPath();
        ctx.moveTo(X(-11), Y(i));
        ctx.lineTo(X(11), Y(i));
        ctx.stroke();
      }

      // Warehouse Aisle Centerline Runway
      ctx.strokeStyle = "rgba(234, 179, 8, 0.4)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(X(0), Y(-7.5));
      ctx.lineTo(X(0), Y(7.5));
      ctx.stroke();
      ctx.setLineDash([]);

      // Perimeter Safety Barrier
      ctx.strokeStyle = "#0284c7";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(X(-11.5), Y(-8), 23 * k, 16 * k);

      // Industrial Storage Racks
      RACKS.forEach((r) => {
        const rx = X(r.x - 1.75), ry = Y(r.z - 0.6);
        const rw = 3.5 * k, rh = 1.2 * k;

        // Base frame
        ctx.fillStyle = "#0b1524";
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(rx, ry, rw, rh);

        // Rack bays & crates
        const bayW = rw / 3;
        for (let b = 0; b < 3; b++) {
          ctx.strokeStyle = "#334155";
          ctx.strokeRect(rx + b * bayW, ry, bayW, rh);
          // Crate pallets inside
          ctx.fillStyle = ["#b45309", "#92400e", "#0369a1"][(b + Math.abs(r.x)) % 3];
          ctx.fillRect(rx + b * bayW + 3, ry + 3, bayW - 6, rh - 6);
        }

        // Steel upright corner posts
        ctx.fillStyle = "#0284c7";
        ctx.fillRect(rx - 1, ry - 1, 4, 4);
        ctx.fillRect(rx + rw - 3, ry - 1, 4, 4);
        ctx.fillRect(rx - 1, ry + rh - 3, 4, 4);
        ctx.fillRect(rx + rw - 3, ry + rh - 3, 4, 4);
      });

      // Animated Laser Active Routes
      const orders = getOrders().filter((o) => o.phase !== "DELIVERED");
      orders.forEach((o) => {
        const isSel = o.id === getSelected();
        const color = PRIO_COLOR[o.prio] || "#0ea5e9";

        ctx.strokeStyle = color;
        ctx.lineWidth = isSel ? 4 : 2;
        ctx.globalAlpha = isSel ? 1 : 0.65;
        ctx.setLineDash([7, 5]);
        ctx.lineDashOffset = -t / 24;

        ctx.beginPath();
        o.route.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"](X(p.x), Y(p.z)));
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        // Waypoints
        o.route.forEach((p) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(X(p.x), Y(p.z), isSel ? 4 : 2.5, 0, Math.PI * 2);
          ctx.fill();
        });
      });

      // Docking Stations (Pick & Drop Bays)
      let hoveredStation = null;
      STATIONS.forEach((s) => {
        const isPick = s.kind === "pick";
        const c = isPick ? "#10b981" : "#0ea5e9";
        const on = isLit(s.id) || getSelectedStation() === s.id;
        const sx = X(s.x), sy = Y(s.z);
        const size = 2.2 * k;
        const bx = sx - size / 2, by = sy - size / 2;

        const isMouseOver = Math.hypot(mouseX - sx, mouseY - sy) < size / 2;
        if (isMouseOver) hoveredStation = s;

        // Station Docking Pad
        ctx.save();
        if (on) {
          ctx.shadowColor = c;
          ctx.shadowBlur = 16 + 6 * Math.sin(t / 180);
        }
        ctx.fillStyle = on ? (isPick ? "rgba(16, 185, 129, 0.22)" : "rgba(14, 165, 233, 0.22)") : "#0a1322";
        ctx.fillRect(bx, by, size, size);
        ctx.strokeStyle = c;
        ctx.lineWidth = on || isMouseOver ? 2.5 : 1.2;
        ctx.strokeRect(bx, by, size, size);
        ctx.restore();

        // Conveyor Rollers
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 1;
        const rollerCount = 4;
        for (let r = 1; r < rollerCount; r++) {
          const rx = bx + (size / rollerCount) * r;
          ctx.beginPath();
          ctx.moveTo(rx, by + 4);
          ctx.lineTo(rx, by + size - 4);
          ctx.stroke();
        }

        // Animated Station Pulsing Rings
        if (on) {
          const pulseR = (size / 2) * (0.8 + 0.2 * Math.sin(t / 200));
          ctx.strokeStyle = c;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(sx, sy, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Station Identifier
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = on ? "#ffffff" : "#94a3b8";
        ctx.fillText(s.id, sx, sy + 4);
      });

      // Swarm AMRs (Robots)
      let hoveredRobot = null;
      const robots = getRobots();
      robots.forEach((r) => {
        const rx = X(r.x), ry = Y(r.z);
        const isFollow = getFollow() === r.id;
        const isCarrying = r.carry;
        const hasOrder = !!r.order;
        const amrColor = isCarrying ? "#10b981" : hasOrder ? "#0ea5e9" : "#38bdf8";

        const isMouseOver = Math.hypot(mouseX - rx, mouseY - ry) < 0.9 * k;
        if (isMouseOver) hoveredRobot = r;

        ctx.save();
        ctx.translate(rx, ry);
        const heading = r.heading || 0;
        ctx.rotate(heading);

        // Forward Headlight Beam Cone
        const beamL = 1.8 * k;
        const beamW = 0.8 * k;
        const grad = ctx.createRadialGradient(0, 0, 4, beamL * 0.8, 0, beamL);
        grad.addColorStop(0, "rgba(56, 189, 248, 0.35)");
        grad.addColorStop(1, "rgba(56, 189, 248, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0.6 * k, 0);
        ctx.lineTo(beamL, -beamW / 2);
        ctx.lineTo(beamL, beamW / 2);
        ctx.closePath();
        ctx.fill();

        // Rotating LiDAR Radar Fan
        const radarAngle = (t / 300) % (Math.PI * 2);
        ctx.save();
        ctx.rotate(radarAngle);
        ctx.fillStyle = "rgba(16, 185, 129, 0.15)";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 1.4 * k, 0, Math.PI / 4);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // 4 Mecanum Wheel Pods
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0.2 * k, -0.44 * k, 0.3 * k, 0.12 * k);
        ctx.fillRect(-0.45 * k, -0.44 * k, 0.3 * k, 0.12 * k);
        ctx.fillRect(0.2 * k, 0.32 * k, 0.3 * k, 0.12 * k);
        ctx.fillRect(-0.45 * k, 0.32 * k, 0.3 * k, 0.12 * k);

        // AMR Armored Hull (Beveled)
        const hl = 0.6 * k, hw = 0.38 * k, c = 0.12 * k;
        ctx.fillStyle = isFollow ? "#1e293b" : "#111a28";
        ctx.strokeStyle = isFollow ? "#38bdf8" : amrColor;
        ctx.lineWidth = isFollow ? 2.5 : 1.5;

        ctx.beginPath();
        ctx.moveTo(-hl + c, -hw);
        ctx.lineTo(hl - c, -hw);
        ctx.lineTo(hl, -hw + c);
        ctx.lineTo(hl, hw - c);
        ctx.lineTo(hl - c, hw);
        ctx.lineTo(-hl + c, hw);
        ctx.lineTo(-hl, hw - c);
        ctx.lineTo(-hl, -hw + c);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Front Headlights
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(hl - 2, -hw * 0.5, 2.5, 0, Math.PI * 2);
        ctx.arc(hl - 2, hw * 0.5, 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Cargo Crate on Deck
        if (isCarrying) {
          ctx.fillStyle = "#92400e";
          ctx.fillRect(-0.35 * k, -0.24 * k, 0.6 * k, 0.48 * k);
          ctx.strokeStyle = "#10b981";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(-0.35 * k, -0.24 * k, 0.6 * k, 0.48 * k);
        } else {
          // Central LiDAR Puck
          ctx.fillStyle = "#090d16";
          ctx.beginPath();
          ctx.arc(0, 0, 0.15 * k, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#10b981";
          ctx.beginPath();
          ctx.arc(0.08 * k, 0, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();

        // Target Reticle for Followed Robot
        if (isFollow) {
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth = 2;
          const reticleSize = 0.9 * k;
          ctx.strokeRect(rx - reticleSize, ry - reticleSize, reticleSize * 2, reticleSize * 2);

          // Corner brackets
          ctx.fillStyle = "#38bdf8";
          ctx.font = "bold 9px monospace";
          ctx.textAlign = "center";
          ctx.fillText("TARGET LOCK", rx, ry - reticleSize - 4);
        }

        // AMR Callsign Badge
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "center";
        ctx.fillStyle = isFollow ? "#38bdf8" : "#f8fafc";
        ctx.fillText(r.id, rx, ry + (isFollow ? 0.9 * k + 14 : 0.8 * k + 10));
      });

      // Update Cursor & Hover Tooltip
      if (hoveredRobot) {
        cv.style.cursor = "pointer";
        setHoverInfo({
          type: "robot",
          id: hoveredRobot.id,
          order: hoveredRobot.order,
          carry: hoveredRobot.carry,
          heading: Math.round(((hoveredRobot.heading || 0) * 180) / Math.PI),
          x: mouseX + 15,
          y: mouseY + 15,
        });
      } else if (hoveredStation) {
        cv.style.cursor = "pointer";
        setHoverInfo({
          type: "station",
          id: hoveredStation.id,
          kind: hoveredStation.kind,
          x: mouseX + 15,
          y: mouseY + 15,
        });
      } else {
        cv.style.cursor = "crosshair";
        setHoverInfo(null);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("mousemove", onMouseMove);
      cv.removeEventListener("mouseleave", onMouseLeave);
      cv.removeEventListener("click", onClick);
    };
  }, []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <canvas ref={ref} style={{ width: "100%", height: "100%", display: "block" }} />

      {/* Floating Tactical Telemetry Tooltip */}
      {hoverInfo && (
        <div
          style={{
            position: "absolute",
            left: Math.min(hoverInfo.x, 380),
            top: Math.min(hoverInfo.y, 240),
            zIndex: 10,
            background: "rgba(11, 19, 34, 0.95)",
            border: "1px solid #1e293b",
            borderRadius: "6px",
            padding: "6px 10px",
            fontSize: "11px",
            fontFamily: "monospace",
            color: "#e2e8f0",
            pointerEvents: "none",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.7)",
            backdropFilter: "blur(4px)",
          }}
        >
          {hoverInfo.type === "robot" ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#38bdf8", fontWeight: "bold" }}>
                <span>{hoverInfo.id} · NEXUS-7</span>
                <span style={{ fontSize: "9px", color: hoverInfo.carry ? "#10b981" : "#94a3b8" }}>
                  {hoverInfo.carry ? "CARRYING" : hoverInfo.order ? "TRANSIT" : "IDLE"}
                </span>
              </div>
              <div style={{ color: "#94a3b8", marginTop: "2px" }}>
                Order: <strong style={{ color: "#f8fafc" }}>{hoverInfo.order || "None"}</strong>
              </div>
              <div style={{ color: "#94a3b8" }}>
                Heading: <strong>{hoverInfo.heading}°</strong> · Speed: <strong>3.2 m/s</strong>
              </div>
              <div style={{ color: "#0ea5e9", fontSize: "10px", marginTop: "4px" }}>
                Click to Follow / Unfollow
              </div>
            </div>
          ) : (
            <div>
              <div style={{ color: hoverInfo.kind === "pick" ? "#10b981" : "#0ea5e9", fontWeight: "bold" }}>
                Station {hoverInfo.id} ({hoverInfo.kind.toUpperCase()})
              </div>
              <div style={{ color: "#94a3b8", marginTop: "2px" }}>
                Conveyor Dock: Ready
              </div>
              <div style={{ color: "#38bdf8", fontSize: "10px", marginTop: "4px" }}>
                Click to Filter Station Orders
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main LiveCanvas Studio with Rail Controls, Camera Presets & Speed Boost   */
/* -------------------------------------------------------------------------- */

export function LiveCanvas() {
  const t = useT();
  const root = useRef();
  const s = useStore();

  const [mode, setMode] = useState("split");
  const [camPreset, setCamPreset] = useState("iso");
  const [key, setKey] = useState(0);
  const [fs, setFs] = useState(false);

  useEffect(() => {
    const f = () => setFs(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);

  const toggleFs = () =>
    document.fullscreenElement ? document.exitFullscreen() : root.current.requestFullscreen?.();

  const B = ({ on, fn, children, cls, title }) => (
    <button className={cls} aria-pressed={!!on} onClick={fn} title={title}>
      {children}
    </button>
  );

  const activeRobotsCount = s.robots.filter((r) => r.order).length;

  return (
    <div className="lc" ref={root}>
      {/* Top Telemetry Header Bar */}
      <div className="lc-hdr">
        <div className="lc-hdr-left">
          <div className="lc-hdr-title">
            <span className="lc-hdr-pulse" />
            <span>NEXUS WMS DIGITAL TWIN</span>
          </div>
          <div className="lc-chips">
            <span className="lc-chip">
              Fleet: <strong>4 AMRs</strong>
            </span>
            <span className="lc-chip">
              Active: <strong>{activeRobotsCount} Running</strong>
            </span>
            <span className="lc-chip">
              SLA: <strong>{s.kpi.ontime}%</strong>
            </span>
            <span className="lc-chip">
              Speed: <strong>{s.speedMult || 1}×</strong>
            </span>
            {s.selectedStation && (
              <span className="lc-chip" style={{ borderColor: "#0ea5e9", color: "#38bdf8" }}>
                Filtered: <strong>{s.selectedStation}</strong>
              </span>
            )}
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px" }}>
          <B fn={() => setInject(true)}>+ New Order</B>
        </div>
      </div>

      {/* Main Workspace View */}
      <div className="lc-view">
        {/* Left Control Rail */}
        <div className="lc-rail" role="toolbar" aria-label="Warehouse Controls">
          {/* View Mode */}
          <div className="lc-rail-group">
            <span className="lc-rail-lbl">View</span>
            <B on={mode === "3d"} fn={() => setMode("3d")} title="3D Digital Twin Full View">3D</B>
            <B on={mode === "2d"} fn={() => setMode("2d")} title="2D Tactical Radar Map">2D</B>
            <B on={mode === "split"} fn={() => setMode("split")} title="Split Twin & 2D Canvas">Split</B>
          </div>

          {/* 3D Camera Angles */}
          {mode !== "2d" && (
            <div className="lc-rail-group">
              <span className="lc-rail-lbl">Camera</span>
              <B on={camPreset === "iso"} fn={() => setCamPreset("iso")} title="Isometric Perspective">Iso 3D</B>
              <B on={camPreset === "top"} fn={() => setCamPreset("top")} title="Top-Down Tactical View">Top-Down</B>
            </div>
          )}

          {/* Simulation Speed Multiplier */}
          <div className="lc-rail-group">
            <span className="lc-rail-lbl">Speed</span>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "2px" }}>
              <B on={(s.speedMult || 1) === 1} fn={() => setSpeedMult(1)} cls="speed-btn">1×</B>
              <B on={s.speedMult === 2} fn={() => setSpeedMult(2)} cls="speed-btn">2×</B>
              <B on={s.speedMult === 4} fn={() => setSpeedMult(4)} cls="speed-btn">4×</B>
            </div>
          </div>

          {/* Robot Autonomous Follow */}
          <div className="lc-rail-group">
            <span className="lc-rail-lbl">Tracking</span>
            <B
              on={!!s.follow}
              cls={s.follow ? "follow-active" : ""}
              fn={cycleFollow}
              title="Click to track next AMR"
            >
              {s.follow ? `Track ${s.follow}` : "Follow Bot"}
            </B>
            {s.follow && (
              <B fn={() => setFollow(null)} title="Release camera tracking">
                Unfollow
              </B>
            )}
            <B
              fn={() => {
                setFollow(null);
                setKey((k) => k + 1);
              }}
              title="Reset camera zoom and rotation"
            >
              Reset Cam
            </B>
          </div>

          {/* Workspace Utilities */}
          <B fn={() => setInject(true)} title="Inject custom order">+ Order</B>
          <B on={fs} fn={toggleFs}>{fs ? "Exit Full" : "Full Screen"}</B>
          <B on={s.estop} fn={toggleEstop} cls="es" title="Emergency Stop All Swarm Robots">
            {t("emergencyStop")}
          </B>
        </div>

        {/* 3D Digital Twin Pane */}
        {mode !== "2d" && (
          <div className="lc-pane">
            <div className="lc-tag">
              <span className="lc-tag-dot" />
              <span>3D Twin • NEXUS Fleet</span>
            </div>
            <span className="lc-hint">Click any AMR to track • Drag to rotate</span>
            <Twin3D key={key} camPreset={camPreset} />
          </div>
        )}

        {/* 2D Tactical Canvas Pane */}
        {mode !== "3d" && (
          <div className="lc-pane">
            <div className="lc-tag">
              <span className="lc-tag-dot" style={{ background: "#10b981" }} />
              <span>2D Radar • Tactical Map</span>
            </div>
            <span className="lc-hint">Hover / Click AMRs or Bays</span>
            <Map2D />
          </div>
        )}

        {/* Emergency Stop Banner */}
        {s.estop && (
          <div className="lc-estop">
            <span>⚠ EMERGENCY STOP ACTIVE ⚠</span>
            <span style={{ fontSize: "14px", fontWeight: "normal", opacity: 0.9 }}>
              All Autonomous Mobile Robots Halted · Manual Override Required
            </span>
          </div>
        )}
      </div>

      {/* Orders SLA Feed and Injection Modal */}
      <div className="lc-feed">
        <OrderSlaTracker />
      </div>
    </div>
  );
}

export default LiveCanvas;
