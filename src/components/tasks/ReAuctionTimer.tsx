import React, { useEffect, useState } from "react";

export interface ReAuctionTimerProps {
  faultAt?: number | null;
  awardedAt?: number | null;
  lastLatencySeconds?: number;
  targetSeconds?: number;
}

export function ReAuctionTimer({
  faultAt = null,
  awardedAt = null,
  lastLatencySeconds = 1.42,
  targetSeconds = 1.8,
}: ReAuctionTimerProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 50);
    return () => window.clearInterval(id);
  }, []);

  const liveLatency =
    faultAt != null
      ? ((awardedAt ?? now) - faultAt) / 1000
      : lastLatencySeconds;

  const complete = faultAt != null && awardedAt != null;
  const ratio = Math.min(liveLatency / targetSeconds, 1);

  return (
    <div className="se-reauction-card">
      <div className="se-metric-label">
        <span>RE-AUCTION LATENCY</span>
        <span className="se-live-dot">LIVE</span>
      </div>

      <div className="se-metric-value">
        {liveLatency.toFixed(2)}<small>s</small>
      </div>

      <div className="se-meter">
        <div
          className="se-meter-fill"
          style={{ width: `${ratio * 100}%` }}
        />
        <span className="se-meter-target">{targetSeconds.toFixed(1)}s target</span>
      </div>

      <div className="se-metric-foot">
        <span>
          {complete
            ? "FAULT → TASK RE-AWARDED"
            : faultAt != null
              ? "AWAITING RE-AWARD"
              : "LAST RECORDED RE-AWARD"}
        </span>
        <strong className={liveLatency < targetSeconds ? "se-good" : "se-warn"}>
          {liveLatency < targetSeconds ? "JUDGE READY" : "OVER TARGET"}
        </strong>
      </div>
    </div>
  );
}

export default ReAuctionTimer;
