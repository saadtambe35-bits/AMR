import { useCallback, useEffect, useId, useRef } from 'react';
import { AlertTriangle, Compass, Crosshair, MapPin, Power, Route, Users, WifiOff, Wifi, X } from 'lucide-react';
import type { HazardEntry, Robot } from './types';
import {
  CockpitChip,
  CockpitStyles,
  SkinGlassCard,
  monoFont,
  palette,
  separationTone,
  toneColor,
} from './cockpitKit';

export interface RobotDetailModalProps {
  /** Robot to inspect; null closes the modal. */
  robot: Robot | null;
  onClose: () => void;
  onToggleWifiIsolation?: (robotId: string, isolate: boolean) => void;
  onKillProcess?: (robotId: string) => void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function hazardTone(h: HazardEntry) {
  const remaining = h.ttlS - h.ageS;
  if (remaining <= 0) return 'neutral' as const;
  if (h.kind === 'PEER_FAULT' || h.kind === 'SPILL') return 'rose' as const;
  return 'amber' as const;
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 700, color: palette.ink, display: 'flex', alignItems: 'center', gap: 7 }}>
      <span aria-hidden="true" style={{ display: 'inline-flex', color: palette.inkSoft }}>{icon}</span>
      {children}
    </h3>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span style={{ fontSize: 11.5, color: palette.inkSoft }}>{label}</span>
      <span style={{ fontFamily: monoFont, fontSize: 13.5, fontWeight: 600, color: palette.ink }}>{value}</span>
    </div>
  );
}

export function RobotDetailModal({ robot, onClose, onToggleWifiIsolation, onKillProcess }: RobotDetailModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const open = robot !== null;

  // Focus management + scroll lock while open; restore focus on close.
  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (n) => !n.hasAttribute('disabled'),
      );
      if (nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!robot) return null;

  const { intent } = robot;
  const peers = [...robot.peers].sort((a, b) => a.distanceM - b.distanceM);

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(41, 37, 36, 0.45)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      <CockpitStyles />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        className="se-anim"
        style={{ width: 'min(880px, 100%)', maxHeight: '92vh', overflowY: 'auto', animation: 'se-modal-in .18s ease-out', borderRadius: 18 }}
      >
        <SkinGlassCard
          padding={22}
          style={{
            background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.72) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.95)',
            boxShadow: '0 20px 45px -8px rgba(150, 135, 115, 0.28), inset 0 1px 1.5px rgba(255, 255, 255, 1)',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h2 id={titleId} style={{ margin: 0, fontSize: 20, fontWeight: 700, color: palette.ink }}>
                {robot.name}
              </h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                <CockpitChip>{robot.id}</CockpitChip>
                <CockpitChip tone={robot.online ? 'emerald' : 'rose'}>{robot.online ? 'ONLINE' : 'OFFLINE'}</CockpitChip>
                <CockpitChip>{robot.state}</CockpitChip>
                <CockpitChip title="Process CPU">CPU {robot.cpuPct.toFixed(1)}%</CockpitChip>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {onKillProcess && (
                <button
                  type="button"
                  className={`se-btn ${robot.state === 'FAULT' ? '' : 'se-btn--danger'}`}
                  style={{
                    background: robot.state === 'FAULT' ? '#10b981' : undefined,
                    color: robot.state === 'FAULT' ? '#ffffff' : undefined,
                    borderColor: robot.state === 'FAULT' ? '#059669' : undefined,
                  }}
                  onClick={() => onKillProcess(robot.id)}
                >
                  <Power size={13} aria-hidden="true" />
                  {robot.state === 'FAULT' ? 'Restore Robot' : 'Kill Process'}
                </button>
              )}
              {onToggleWifiIsolation ? (
                <button
                  type="button"
                  className="se-btn se-btn--warn"
                  disabled={!robot.online && robot.state !== 'FAULT'}
                  onClick={() => onToggleWifiIsolation(robot.id, !robot.wifiIsolated)}
                >
                  {robot.wifiIsolated ? <Wifi size={13} aria-hidden="true" /> : <WifiOff size={13} aria-hidden="true" />}
                  {robot.wifiIsolated ? 'Restore Wi-Fi' : 'Isolate Wi-Fi'}
                </button>
              ) : null}
              <button ref={closeRef} type="button" className="se-btn" onClick={onClose} aria-label="Close robot details">
                <X size={14} aria-hidden="true" /> Close
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginTop: 18 }}>
            {/* Intent */}
            <section aria-label="Live intent">
              <SectionTitle icon={<Route size={15} />}>Live intent</SectionTitle>
              {intent ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <KeyValue label="From → To" value={`${intent.fromNode} → ${intent.toNode}`} />
                    <KeyValue label="ETA" value={`${intent.etaS.toFixed(1)} s`} />
                    <KeyValue label="Position" value={`(${robot.position.x.toFixed(2)}, ${robot.position.y.toFixed(2)}) m`} />
                    <KeyValue label="Target" value={`(${intent.target.x.toFixed(2)}, ${intent.target.y.toFixed(2)}) m`} />
                    <KeyValue label="Heading" value={`${intent.headingDeg.toFixed(0)}°`} />
                    <KeyValue label="Intent seq" value={`#${intent.seq}`} />
                  </div>
                  <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {intent.waypoints.map((w, i) => (
                      <li key={`${w.node ?? 'wp'}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: monoFont, fontSize: 12, color: palette.ink }}>
                        <Crosshair size={12} aria-hidden="true" color={palette.inkSoft} />
                        {w.node ? `${w.node} ` : ''}({w.x.toFixed(2)}, {w.y.toFixed(2)})
                      </li>
                    ))}
                  </ol>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: palette.inkSoft }}>
                  No intent received. This robot has not broadcast a route yet.
                </p>
              )}
            </section>

            {/* Peer distances */}
            <section aria-label="Peer distances">
              <SectionTitle icon={<Users size={15} />}>Peer distances</SectionTitle>
              {peers.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: palette.inkSoft }}>No peers in range.</p>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table className="se-table">
                    <thead>
                      <tr>
                        <th scope="col">Peer</th>
                        <th scope="col">Distance</th>
                        <th scope="col">Closing</th>
                        <th scope="col">Heard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {peers.map((p) => {
                        const tone = separationTone(p.distanceM);
                        return (
                          <tr key={p.peerId}>
                            <td style={{ fontFamily: monoFont }}>{p.peerId}</td>
                            <td style={{ fontFamily: monoFont, fontWeight: 700, color: tone === 'emerald' ? palette.ink : toneColor[tone] }}>
                              {p.distanceM.toFixed(2)} m
                            </td>
                            <td style={{ fontFamily: monoFont }}>
                              {p.closingSpeedMps > 0 ? '−' : '+'}
                              {Math.abs(p.closingSpeedMps).toFixed(2)} m/s
                            </td>
                            <td style={{ fontFamily: monoFont, color: palette.inkSoft }}>{p.lastHeardMs} ms ago</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          {/* Hazards */}
          <section aria-label="Local hazard cache" style={{ marginTop: 18 }}>
            <SectionTitle icon={<AlertTriangle size={15} />}>Local hazard cache</SectionTitle>
            {robot.hazards.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: palette.inkSoft }}>Cache is empty. No hazards known to this robot.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="se-table">
                  <thead>
                    <tr>
                      <th scope="col">Hazard</th>
                      <th scope="col">Location</th>
                      <th scope="col">Age / TTL</th>
                      <th scope="col">Reported by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {robot.hazards.map((h) => (
                      <tr key={h.id}>
                        <td>
                          <CockpitChip tone={hazardTone(h)}>{h.kind}</CockpitChip>
                        </td>
                        <td style={{ fontFamily: monoFont }}>
                          <MapPin size={12} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 4 }} />
                          {h.location}
                        </td>
                        <td style={{ fontFamily: monoFont }}>
                          {h.ageS.toFixed(0)} s / {h.ttlS.toFixed(0)} s
                        </td>
                        <td style={{ fontFamily: monoFont }}>
                          <Compass size={12} aria-hidden="true" style={{ verticalAlign: '-1px', marginRight: 4 }} />
                          {h.reportedBy}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </SkinGlassCard>
      </div>
    </div>
  );
}

export default RobotDetailModal;
