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
        .se-profiler{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9f0f5;background:#071016;padding:18px;border-radius:20px}
        .ep-kicker{font-size:10px;letter-spacing:.18em;color:#70a0ad;font-weight:800}.ep-title{font-size:21px;font-weight:800;margin-top:3px}.ep-sub{font-size:11px;color:#718690;margin-top:4px}
        .ep-layout{display:grid;grid-template-columns:1.35fr 1fr;gap:12px;margin-top:14px}.ep-panel{background:#0a151b;border:1px solid #172830;border-radius:14px;padding:12px;box-shadow:inset 0 1px 0 #1a3039}.ep-panel-title{font-size:9px;letter-spacing:.12em;font-weight:900;color:#8199a2;margin-bottom:10px}
        .ep-robots{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.ep-robot{padding:10px;border:1px solid #182c34;background:#0c181e;border-radius:10px}.ep-robot-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.ep-id{font:800 11px ui-monospace}.ep-platform{font-size:8px;color:#6e8992}.ep-gauge{margin-top:8px}.ep-gauge-top{display:flex;justify-content:space-between;font-size:8px;color:#718891}.ep-gauge-top strong{font:800 9px ui-monospace;color:#b9d4d9}.ep-track{height:5px;background:#061015;border-radius:99px;overflow:hidden;margin-top:4px}.ep-progress{height:100%;background:#55aebb;border-radius:99px}.ep-limit{font-size:7px;color:#526970;margin-top:3px}.ep-limit b{color:#7699a3}
        .ep-scale{display:flex;align-items:end;gap:8px;height:170px;padding:12px 6px 22px;border-bottom:1px solid #1a2d35}.ep-bar-wrap{height:100%;flex:1;display:flex;align-items:end;justify-content:center;position:relative}.ep-bar{width:48%;min-height:5px;background:#4b9daa;border-radius:5px 5px 0 0}.ep-bar-label{position:absolute;bottom:-18px;font:8px ui-monospace;color:#627981}.ep-value{position:absolute;top:-14px;font:8px ui-monospace;color:#84bfc7}
        .ep-note{font-size:8px;color:#617780;line-height:1.5;margin-top:10px}.ep-note b{color:#8bbbc3}.ep-flat{color:#72cba4;font-weight:800}
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
