import React from "react";

export interface EdgeRobotMetric {
  robot_id: string;
  platform: "Raspberry Pi" | "Jetson";
  cpu_pct: number;
  rss_mb: number;
  zenoh_kbps: number;
}

export interface FleetBandwidthPoint {
  robots: number;
  kbpsPerRobot: number;
  fleetKbps: number;
}

const robots: EdgeRobotMetric[] = [
  { robot_id:"R-02", platform:"Raspberry Pi", cpu_pct:27.4, rss_mb:214, zenoh_kbps:8.7 },
  { robot_id:"R-03", platform:"Raspberry Pi", cpu_pct:31.2, rss_mb:236, zenoh_kbps:9.1 },
  { robot_id:"R-07", platform:"Jetson", cpu_pct:18.8, rss_mb:268, zenoh_kbps:8.4 },
  { robot_id:"R-11", platform:"Raspberry Pi", cpu_pct:34.6, rss_mb:249, zenoh_kbps:9.0 },
];

const fleet: FleetBandwidthPoint[] = [
  { robots:3, kbpsPerRobot:9.1, fleetKbps:27.3 },
  { robots:10, kbpsPerRobot:8.9, fleetKbps:89.0 },
  { robots:20, kbpsPerRobot:8.8, fleetKbps:176.0 },
  { robots:30, kbpsPerRobot:8.7, fleetKbps:261.0 },
];

function Gauge({ value, max, label, unit, limit }: { value:number; max:number; label:string; unit:string; limit:string }) {
  const pct = Math.min(value / max, 1) * 100;
  return (
    <div className="ep-gauge">
      <div className="ep-gauge-top"><span>{label}</span><strong>{value.toFixed(1)}{unit}</strong></div>
      <div className="ep-track"><div className="ep-progress" style={{width:`${pct}%`}} /></div>
      <div className="ep-limit">PI-CLASS LIMIT <b>{limit}</b></div>
    </div>
  );
}

export interface EdgeProfilerProps {
  metrics?: EdgeRobotMetric[];
  fleetPoints?: FleetBandwidthPoint[];
}

export function EdgeProfiler({ metrics = robots, fleetPoints = fleet }: EdgeProfilerProps) {
  const maxFleet = Math.max(...fleetPoints.map((p) => p.fleetKbps));

  return (
    <section className="se-profiler">
      <style>{`
        .se-profiler{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#231f1c;background:linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.45) 60%, rgba(245, 243, 236, 0.35) 100%) !important;backdrop-filter:blur(28px) saturate(160%) !important;-webkit-backdrop-filter:blur(28px) saturate(160%) !important;border:1px solid rgba(255,255,255,0.88) !important;box-shadow:0 20px 40px -15px rgba(135, 120, 100, 0.16), 0 6px 14px -4px rgba(135, 120, 100, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.98), inset 0 -1px 2px rgba(180, 165, 145, 0.12) !important;padding:20px;border-radius:18px;box-sizing:border-box;position:relative;}
        .se-profiler::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg, transparent 2%, rgba(255,255,255,0.4) 15%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 85%, transparent 98%) !important;filter:drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8));pointer-events:none;border-radius:18px 18px 0 0;}
        .ep-kicker{font-size:10px;letter-spacing:.16em;color:#0284c7;font-weight:800;text-transform:uppercase}
        .ep-title{font-size:21px;font-weight:900;letter-spacing:-.02em;color:#231f1c;margin-top:3px}
        .ep-sub{font-size:12px;color:#57534e;margin-top:4px;font-weight:500}
        .ep-layout{display:grid;grid-template-columns:1.35fr 1fr;gap:14px;margin-top:16px}
        .ep-panel{background:#eae5d9 !important;border:1px solid rgba(255, 255, 255, 0.6) !important;border-top-color:rgba(160, 148, 130, 0.28) !important;border-left-color:rgba(160, 148, 130, 0.22) !important;border-radius:14px;padding:14px;box-shadow:inset 3px 3px 6px rgba(150, 138, 120, 0.25), inset -2px -2px 5px rgba(255, 255, 255, 0.92) !important;}
        .ep-panel-title{font-size:10px;letter-spacing:.12em;font-weight:800;color:#57534e;margin-bottom:12px;text-transform:uppercase}
        .ep-robots{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
        .ep-robot{padding:12px;border:1px solid rgba(255, 255, 255, 0.95);background:linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.72) 100%);border-radius:12px;box-shadow:0 4px 10px rgba(150, 135, 115, 0.12), inset 0 1px 1px #fff;transition:transform 0.15s ease,box-shadow 0.15s ease}
        .ep-robot:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(150, 135, 115, 0.16), inset 0 1px 1px #fff}
        .ep-robot-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
        .ep-id{font:800 12px ui-monospace,"JetBrains Mono",monospace;color:#231f1c}
        .ep-platform{font-size:9px;color:rgba(235, 220, 200, 0.92);background:linear-gradient(160deg, #241d18 0%, #16120f 100%) !important;border:1px solid rgba(217, 180, 150, 0.35) !important;padding:2px 6px;border-radius:6px;font-weight:700;font-family:ui-monospace,Menlo,monospace;box-shadow:0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15);text-shadow:0 1px 2px rgba(0,0,0,0.6);}
        .ep-gauge{margin-top:8px}
        .ep-gauge-top{display:flex;justify-content:space-between;font-size:9px;color:#57534e;font-weight:500}
        .ep-gauge-top strong{font:800 10.5px ui-monospace,"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;color:#231f1c}
        .ep-track{height:6px;background:#eae5d9;border-radius:99px;overflow:hidden;margin-top:4px;border:1px solid rgba(255, 255, 255, 0.6);border-top-color:rgba(160, 148, 130, 0.25);box-shadow:inset 1px 1px 3px rgba(150, 138, 120, 0.25)}
        .ep-progress{height:100%;background:linear-gradient(90deg,#0ea5e9,#10b981);border-radius:99px;box-shadow:0 0 6px rgba(14,165,233,0.5)}
        .ep-limit{font-size:8.5px;color:#57534e;margin-top:4px;font-family:ui-monospace,"JetBrains Mono",monospace}
        .ep-limit b{color:#231f1c}
        .ep-scale{display:flex;align-items:end;gap:8px;height:170px;padding:12px 6px 24px;border-bottom:1px solid rgba(215, 208, 195, 0.8)}
        .ep-bar-wrap{height:100%;flex:1;display:flex;align-items:end;justify-content:center;position:relative}
        .ep-bar{width:48%;min-height:5px;background:linear-gradient(180deg,#0ea5e9,#3e3832);border:1px solid rgba(14, 165, 233, 0.5);border-radius:5px 5px 0 0;box-shadow:0 2px 6px rgba(14, 165, 233, 0.2)}
        .ep-bar-label{position:absolute;bottom:-20px;font:9px ui-monospace,"JetBrains Mono",monospace;color:#57534e}
        .ep-value{position:absolute;top:-16px;font:800 9.5px ui-monospace,"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;color:#0284c7}
        .ep-note{font-size:9.5px;color:#57534e;line-height:1.6;margin-top:12px;font-weight:500}
        .ep-note b{color:#231f1c}
        .ep-flat{color:#059669;font-weight:800}
        @media(max-width:800px){.ep-layout{grid-template-columns:1fr}.ep-robots{grid-template-columns:1fr}}
      `}</style>

      <div>
        <div className="ep-kicker">BLOCK 5 / P3 · EDGE RESOURCE PROFILER</div>
        <div className="ep-title">Edge Runtime Envelope</div>
        <div className="ep-sub">Pi / Jetson resource gauges with Zone Sharding bandwidth scaling</div>
      </div>

      <div className="ep-layout">
        <div className="ep-panel">
          <div className="ep-panel-title">ROBOT EDGE RESOURCES</div>
          <div className="ep-robots">
            {metrics.map((r) => (
              <div className="ep-robot" key={r.robot_id}>
                <div className="ep-robot-head">
                  <span className="ep-id">{r.robot_id}</span>
                  <span className="ep-platform">{r.platform}</span>
                </div>
                <Gauge value={r.cpu_pct} max={40} label="CPU / 1 CORE" unit="%" limit="< 40%" />
                <Gauge value={r.rss_mb} max={300} label="RSS MEMORY" unit=" MB" limit="< 300 MB" />
                <Gauge value={r.zenoh_kbps} max={12} label="ZENOH" unit=" kbps" limit="zone-local" />
              </div>
            ))}
          </div>
        </div>

        <div className="ep-panel">
          <div className="ep-panel-title">ZENOH BANDWIDTH vs FLEET SIZE</div>
          <div className="ep-scale">
            {fleetPoints.map((p) => (
              <div className="ep-bar-wrap" key={p.robots}>
                <span className="ep-value">{p.kbpsPerRobot.toFixed(1)}</span>
                <div className="ep-bar" style={{height:`${Math.max(5,(p.fleetKbps/maxFleet)*100)}%`}} />
                <span className="ep-bar-label">{p.robots}R</span>
              </div>
            ))}
          </div>
          <div className="ep-note">
            Per-robot Zenoh traffic stays within a narrow <b>8.7–9.1 kbps</b> envelope as the fleet scales
            from <b>3 → 30 robots</b>. <span className="ep-flat">ZONE SHARDING: FLAT PER-ROBOT BANDWIDTH</span>.
          </div>
        </div>
      </div>
    </section>
  );
}

export default EdgeProfiler;
