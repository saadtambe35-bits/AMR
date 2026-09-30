import React, { useState } from "react";

export type HazardType = "BLOCKED_EDGE" | "SLOW_ZONE" | "SOS_GEOFENCE";

export interface HazardReport {
  id: string;
  type: HazardType;
  origin_id: string;
  version: number;
  hop_count: number;
  edge?: string;
  detail: string;
  timestamp: string;
}

const seedReports: HazardReport[] = [
  { id:"HZ-882", type:"BLOCKED_EDGE", origin_id:"R-07", version:14, hop_count:2, edge:"B07 → C07", detail:"Aisle obstruction confirmed", timestamp:"00:42:18.4" },
  { id:"HZ-881", type:"SLOW_ZONE", origin_id:"R-03", version:9, hop_count:3, edge:"A03 → B03", detail:"Congestion / reduced speed", timestamp:"00:42:17.9" },
  { id:"HZ-880", type:"SOS_GEOFENCE", origin_id:"R-11", version:3, hop_count:1, edge:"D02 / 4m radius", detail:"Robot SOS geofence active", timestamp:"00:42:16.1" },
  { id:"HZ-879", type:"BLOCKED_EDGE", origin_id:"R-02", version:13, hop_count:4, edge:"B07 → C07", detail:"Superseded by v14", timestamp:"00:42:12.7" },
];

const typeMeta: Record<HazardType, { label: string; icon: string }> = {
  BLOCKED_EDGE: { label: "BLOCKED EDGE", icon: "⛔" },
  SLOW_ZONE: { label: "SLOW ZONE", icon: "≈" },
  SOS_GEOFENCE: { label: "SOS GEOFENCE", icon: "⌖" },
};

export interface HazardGossipFeedProps {
  reports?: HazardReport[];
  onInjectBlockage?: (report: HazardReport) => void;
}

export function HazardGossipFeed({
  reports: initialReports = seedReports,
  onInjectBlockage,
}: HazardGossipFeedProps) {
  const [reports, setReports] = useState(initialReports);
  const [digest, setDigest] = useState(97.8);

  const inject = () => {
    const report: HazardReport = {
      id: `HZ-${883 + reports.length}`,
      type: "BLOCKED_EDGE",
      origin_id: "EDGE-LOCAL",
      version: 15,
      hop_count: 0,
      edge: "A07 → A08",
      detail: "Injected aisle blockage for demo",
      timestamp: new Date().toLocaleTimeString("en-GB", { hour12: false }),
    };
    setReports((r) => [report, ...r]);
    setDigest(100);
    onInjectBlockage?.(report);
  };

  return (
    <section className="se-gossip">
      <style>{`
        .se-gossip{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9f0f5;background:#071016;padding:18px;border-radius:20px}
        .sg-head{display:flex;justify-content:space-between;align-items:start;gap:15px}.sg-kicker{font-size:10px;letter-spacing:.18em;color:#70a0ad;font-weight:800}.sg-title{font-size:21px;font-weight:800;margin-top:3px}.sg-sub{font-size:11px;color:#718690;margin-top:4px}
        .sg-actions{display:flex;gap:7px;align-items:center}.sg-digest{padding:7px 9px;background:#0c1a20;border:1px solid #1a3039;border-radius:8px;font:700 9px ui-monospace;color:#83b8c1}.sg-button{border:1px solid #34535e;background:#10232a;color:#b9e0e6;border-radius:8px;padding:8px 10px;font-size:9px;font-weight:900;cursor:pointer}.sg-button:hover{background:#17313a}
        .sg-feed{margin-top:14px;display:grid;gap:7px}.sg-item{display:grid;grid-template-columns:25px 1fr auto;gap:9px;align-items:center;padding:9px 10px;background:#0a151b;border:1px solid #172830;border-radius:11px;box-shadow:inset 0 1px 0 #1a3039}.sg-icon{font-size:14px}.sg-main{min-width:0}.sg-row{display:flex;align-items:center;gap:7px;flex-wrap:wrap}.sg-type{font-size:9px;font-weight:900;letter-spacing:.08em}.sg-edge{font-size:9px;color:#718991}.sg-detail{font-size:10px;color:#a1b3b9;margin-top:3px}.sg-meta{text-align:right;font:8px ui-monospace;color:#647981;white-space:nowrap}.sg-meta strong{display:block;color:#8bbac3;font-size:9px;margin-bottom:2px}.sg-superseded{opacity:.52}
        .sg-footer{display:flex;gap:7px;margin-top:10px}.sg-chip{font-size:8px;letter-spacing:.08em;color:#67818a;border:1px solid #172b33;padding:5px 7px;border-radius:6px}
      `}</style>

      <div className="sg-head">
        <div>
          <div className="sg-kicker">BLOCK 5 / C7 · DECENTRALIZED GOSSIP</div>
          <div className="sg-title">Hazard Gossip Monitor</div>
          <div className="sg-sub">HazardReport anti-entropy stream · higher versions supersede older state</div>
        </div>
        <div className="sg-actions">
          <span className="sg-digest">DIGEST SYNC {digest.toFixed(1)}%</span>
          <button className="sg-button" onClick={inject}>＋ INJECT AISLE BLOCKAGE</button>
        </div>
      </div>

      <div className="sg-feed">
        {reports.map((report) => {
          const meta = typeMeta[report.type];
          const superseded = report.detail.toLowerCase().includes("superseded");
          return (
            <div className={`sg-item ${superseded ? "sg-superseded" : ""}`} key={report.id}>
              <div className="sg-icon">{meta.icon}</div>
              <div className="sg-main">
                <div className="sg-row">
                  <span className="sg-type">{meta.label}</span>
                  <span className="sg-edge">{report.edge}</span>
                </div>
                <div className="sg-detail">{report.detail}</div>
              </div>
              <div className="sg-meta">
                <strong>v{report.version} · {report.origin_id}</strong>
                HOP {report.hop_count} · {report.timestamp}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sg-footer">
        <span className="sg-chip">ANTI-ENTROPY ACTIVE</span>
        <span className="sg-chip">VERSION VECTOR CONSISTENT</span>
        <span className="sg-chip">SOS GEOFENCE 01 ACTIVE</span>
      </div>
    </section>
  );
}

export default HazardGossipFeed;
