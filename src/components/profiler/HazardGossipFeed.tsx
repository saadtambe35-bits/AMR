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
        .se-gossip{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#231f1c;background:linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.45) 60%, rgba(245, 243, 236, 0.35) 100%) !important;backdrop-filter:blur(28px) saturate(160%) !important;-webkit-backdrop-filter:blur(28px) saturate(160%) !important;border:1px solid rgba(255,255,255,0.88) !important;box-shadow:0 20px 40px -15px rgba(135, 120, 100, 0.16), 0 6px 14px -4px rgba(135, 120, 100, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.98), inset 0 -1px 2px rgba(180, 165, 145, 0.12) !important;padding:20px;border-radius:18px;box-sizing:border-box;position:relative;}
        .se-gossip::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg, transparent 2%, rgba(255,255,255,0.4) 15%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 85%, transparent 98%) !important;filter:drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8));pointer-events:none;border-radius:18px 18px 0 0;}
        .sg-head{display:flex;justify-content:space-between;align-items:start;gap:15px;flex-wrap:wrap}
        .sg-kicker{font-size:10px;letter-spacing:.16em;color:#0284c7;font-weight:800;text-transform:uppercase}
        .sg-title{font-size:21px;font-weight:900;letter-spacing:-.02em;color:#231f1c;margin-top:3px}
        .sg-sub{font-size:12px;color:#57534e;margin-top:4px;font-weight:500}
        .sg-actions{display:flex;gap:8px;align-items:center}
        .sg-digest{padding:7px 11px;background:linear-gradient(160deg, #241d18 0%, #16120f 100%) !important;border:1px solid rgba(217, 180, 150, 0.35) !important;border-radius:8px;font:700 10px ui-monospace,"JetBrains Mono",monospace;color:rgba(235, 220, 200, 0.92);box-shadow:0 4px 12px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15) !important;text-shadow:0 1px 2px rgba(0,0,0,0.6);}
        .sg-button{border:1px solid rgba(255, 255, 255, 0.7);background:linear-gradient(145deg, #faf8f2, #ede9df);color:#231f1c;border-radius:8px;padding:8px 12px;font-size:10.5px;font-weight:800;cursor:pointer;letter-spacing:0.03em;box-shadow:3px 3px 8px rgba(160,148,130,0.18), -2px -2px 6px rgba(255,255,255,0.9);transition:all 0.15s ease}
        .sg-button:hover{background:linear-gradient(145deg, #ffffff, #ede9df);transform:translateY(-1px);box-shadow:4px 4px 10px rgba(160,148,130,0.22), -3px -3px 8px rgba(255,255,255,1)}
        .sg-button:active{transform:translateY(1px)}
        .sg-feed{margin-top:14px;display:grid;gap:8px}
        .sg-item{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;padding:11px 13px;background:linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.72) 100%);border:1px solid rgba(255,255,255,0.98);border-radius:12px;box-shadow:0 4px 12px rgba(150,135,115,0.12), inset 0 1px 1px #fff;transition:transform 0.15s ease,box-shadow 0.15s ease}
        .sg-item:hover{transform:translateY(-1px);box-shadow:0 8px 18px rgba(150,135,115,0.16), inset 0 1px 1px #fff}
        .sg-icon{font-size:15px}
        .sg-main{min-width:0}
        .sg-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
        .sg-type{font-size:9.5px;font-weight:900;letter-spacing:.08em;color:#b91c1c}
        .sg-edge{font-size:9.5px;color:#57534e;font-family:ui-monospace,"JetBrains Mono",monospace;font-weight:500}
        .sg-detail{font-size:11px;color:#231f1c;font-weight:700;margin-top:3px}
        .sg-meta{text-align:right;font:9px ui-monospace,"JetBrains Mono",monospace;font-variant-numeric:tabular-nums;color:#57534e;white-space:nowrap}
        .sg-meta strong{display:block;color:#0284c7;font-size:10px;margin-bottom:2px;font-weight:700}
        .sg-superseded{opacity:.5}
        .sg-footer{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
        .sg-chip{font-size:9px;letter-spacing:.08em;color:rgba(235, 220, 200, 0.92);border:1px solid rgba(217, 180, 150, 0.35);background:linear-gradient(160deg, #241d18 0%, #16120f 100%) !important;padding:5px 9px;border-radius:6px;font-family:ui-monospace,"JetBrains Mono",monospace;font-weight:700;box-shadow:0 2px 6px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.15);text-shadow:0 1px 2px rgba(0,0,0,0.6);}
      `}</style>

      <div className="sg-head">
        <div>
          <div className="sg-kicker">BLOCK 5 / C7 · DECENTRALIZED GOSSIP</div>
          <div className="sg-title">Hazard Gossip Monitor</div>
          <div className="sg-sub">HazardReport anti-entropy stream · higher versions supersede older state</div>
        </div>
        <div className="sg-actions">
          <span className="sg-digest">DIGEST SYNC {digest.toFixed(1)}%</span>
          <button className="shiny-dark-button" style={{ padding: '7px 15px', fontSize: '11px' }} onClick={inject}>
            ＋ INJECT AISLE BLOCKAGE
          </button>
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
