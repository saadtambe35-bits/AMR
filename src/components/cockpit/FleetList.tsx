import { useEffect, useState } from 'react';
import { Battery, KeyRound, Package, Power, Search, WifiOff, Wifi, Zap } from 'lucide-react';
import type { LeaseStatus, Robot, RobotState } from './types';
import {
  CockpitChip,
  CockpitStyles,
  OpticalLed,
  RecessedWell,
  SkinGlassCard,
  batteryTone,
  monoFont,
  palette,
  toneColor,
} from './cockpitKit';
import type { Tone } from './cockpitKit';

export interface FleetListProps {
  robots: Robot[];
  selectedRobotId?: string | null;
  onInspect: (robotId: string) => void;
  onToggleWifiIsolation: (robotId: string, isolate: boolean) => void;
  onKillProcess: (robotId: string) => void;
}

const STATE_TONE: Record<RobotState, Tone> = {
  IDLE: 'neutral',
  CRUISING: 'sky',
  APPROACHING: 'amber',
  CROSSING: 'emerald',
  YIELDING: 'amber',
  CHARGING: 'sky',
  FAULT: 'rose',
  ISOLATED: 'rose',
};

const LEASE_LABEL: Record<LeaseStatus, string> = {
  HELD: 'Lease held',
  QUEUED: 'Lease queued',
  NONE: 'No lease',
};

const KILL_ARM_MS = 3000;

export function FleetList({ robots, selectedRobotId, onInspect, onToggleWifiIsolation, onKillProcess }: FleetListProps) {
  const [armedKillId, setArmedKillId] = useState<string | null>(null);

  // Kill Process is destructive: first click arms, second click within 3 s confirms.
  useEffect(() => {
    if (armedKillId === null) return undefined;
    const t = window.setTimeout(() => setArmedKillId(null), KILL_ARM_MS);
    return () => window.clearTimeout(t);
  }, [armedKillId]);

  if (robots.length === 0) {
    return (
      <SkinGlassCard>
        <p style={{ margin: 0, color: palette.inkSoft, fontSize: 14 }}>
          No robots visible on the mesh yet. Start a peer process and it will appear here.
        </p>
      </SkinGlassCard>
    );
  }

  return (
    <section aria-label="Fleet" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 14 }}>
      <CockpitStyles />
      {robots.map((robot) => {
        const stateTone = STATE_TONE[robot.state];
        const battery = Math.min(100, Math.max(0, robot.batteryPct));
        const bTone = batteryTone(battery);
        const armed = armedKillId === robot.id;
        const selected = selectedRobotId === robot.id;
        const dim = !robot.online;

        return (
          <SkinGlassCard
            key={robot.id}
            padding={16}
            accent={selected ? 'sky' : robot.state === 'FAULT' ? 'rose' : undefined}
            className="hover:-translate-y-1 hover:shadow-[0_24px_48px_-12px_rgba(135,120,100,0.22),inset_0_1px_2px_rgba(255,255,255,1)] transition-all duration-200"
            style={{ opacity: dim ? 0.62 : 1 }}
          >
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                <OpticalLed tone={robot.online ? 'emerald' : 'rose'} size={10} label={robot.online ? 'Online' : 'Offline'} />
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: palette.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {robot.name}
                  </h3>
                  <span style={{ fontFamily: monoFont, fontSize: 11, color: palette.inkFaint, fontWeight: 700 }}>{robot.id}</span>
                </div>
              </div>
              <CockpitChip tone={stateTone}>{robot.state}</CockpitChip>
            </div>

            {/* Battery */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: palette.inkSoft, marginBottom: 5 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                  <Battery size={13} aria-hidden="true" /> Battery
                </span>
                <span style={{ fontFamily: monoFont, fontWeight: 800, color: bTone === 'emerald' ? palette.ink : toneColor[bTone] }}>
                  {battery.toFixed(0)}%
                </span>
              </div>
              <RecessedWell height={12}>
                <div
                  role="progressbar"
                  aria-label={`${robot.name} battery`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(battery)}
                  style={{
                    width: `${battery}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: `linear-gradient(90deg, ${toneColor[bTone]}, ${toneColor[bTone]}ee)`,
                    boxShadow: `0 0 10px ${toneColor[bTone]}88, inset 0 1px 1px rgba(255, 255, 255, 0.7)`,
                    transition: 'width .3s ease, background .3s ease',
                  }}
                />
              </RecessedWell>
            </div>

            {/* Telemetry chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              <CockpitChip title="Velocity">
                <Zap size={12} aria-hidden="true" /> v = {robot.speedMps.toFixed(1)} m/s
              </CockpitChip>
              <CockpitChip title="Payload">
                <Package size={12} aria-hidden="true" /> {robot.payloadKg} kg
              </CockpitChip>
              <CockpitChip
                tone={robot.leaseStatus === 'HELD' ? 'emerald' : robot.leaseStatus === 'QUEUED' ? 'amber' : 'neutral'}
                title="Intersection lease"
              >
                <KeyRound size={12} aria-hidden="true" />
                {LEASE_LABEL[robot.leaseStatus]}
                {robot.leaseNodeId ? ` · ${robot.leaseNodeId}` : ''}
              </CockpitChip>
              {robot.wifiIsolated ? (
                <CockpitChip tone="rose" title="Wi-Fi isolated">
                  <WifiOff size={12} aria-hidden="true" /> Wi-Fi isolated
                </CockpitChip>
              ) : null}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
              <button type="button" className="tactile-convex-btn se-btn" onClick={() => onInspect(robot.id)} aria-label={`Inspect ${robot.name}`}>
                <Search size={13} aria-hidden="true" /> Inspect
              </button>
              <button
                type="button"
                className="tactile-convex-btn se-btn se-btn--warn"
                disabled={!robot.online}
                onClick={() => onToggleWifiIsolation(robot.id, !robot.wifiIsolated)}
                aria-pressed={robot.wifiIsolated}
                aria-label={`${robot.wifiIsolated ? 'Restore' : 'Isolate'} Wi-Fi for ${robot.name}`}
              >
                {robot.wifiIsolated ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
                {robot.wifiIsolated ? 'Restore Wi-Fi' : 'Isolate Wi-Fi'}
              </button>
              <button
                type="button"
                className={`tactile-convex-btn se-btn ${armed ? 'se-btn--armed' : 'se-btn--danger'}`}
                disabled={!robot.online}
                onClick={() => {
                  if (armed) {
                    setArmedKillId(null);
                    onKillProcess(robot.id);
                  } else {
                    setArmedKillId(robot.id);
                  }
                }}
                aria-label={armed ? `Confirm kill process for ${robot.name}` : `Kill process for ${robot.name}`}
              >
                <Power size={13} aria-hidden="true" />
                {armed ? 'Confirm kill' : 'Kill Process'}
              </button>
            </div>
          </SkinGlassCard>
        );
      })}
    </section>
  );
}

export default FleetList;
