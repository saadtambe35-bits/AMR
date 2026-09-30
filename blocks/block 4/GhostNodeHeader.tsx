import { Clock, Eye, Network, Pause, Play, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { MeshState } from '../cockpit/types';
import {
  CockpitChip,
  CockpitStyles,
  OpticalLed,
  SkinGlassCard,
  formatClock,
  monoFont,
  palette,
  toneColor,
} from '../cockpit/cockpitKit';
import type { Tone } from '../cockpit/cockpitKit';

export interface GhostNodeHeaderProps {
  /** Packets the observer has published to the mesh. Must be 0 — any other value is rendered as a violation. */
  observerPacketsPublished: number;
  meshState: MeshState;
  /** Peers currently visible on the mesh. */
  meshPeerCount: number;
  /** Scenario timeline position in seconds. */
  timelineSeconds: number;
  isLive: boolean;
  playbackSpeed?: number;
  scenarioName?: string;
  onTogglePlayback?: () => void;
}

const MESH_TONE: Record<MeshState, Tone> = {
  CONVERGED: 'emerald',
  FORMING: 'sky',
  DEGRADED: 'amber',
  PARTITIONED: 'rose',
};

export function GhostNodeHeader({
  observerPacketsPublished,
  meshState,
  meshPeerCount,
  timelineSeconds,
  isLive,
  playbackSpeed = 1,
  scenarioName,
  onTogglePlayback,
}: GhostNodeHeaderProps) {
  const violated = observerPacketsPublished !== 0;
  const proofColor = violated ? palette.rose : palette.emerald;
  const meshTone = MESH_TONE[meshState];

  return (
    <header aria-label="Ghost-node command header">
      <CockpitStyles />
      <SkinGlassCard padding="12px 18px">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, justifyContent: 'space-between' }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span
              aria-hidden="true"
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 38,
                height: 38,
                borderRadius: 12,
                background: palette.cockpit,
                color: palette.cockpitText,
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 3px 8px rgba(0,0,0,.3)',
              }}
            >
              <Radar size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: palette.ink }}>
                SwarmEdge v2
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: palette.inkSoft }}>
                {scenarioName ? `Fleet cockpit · ${scenarioName}` : 'Fleet cockpit'}
              </p>
            </div>
          </div>

          {/* Ghost-node proof */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span
              className="cockpit-dark-chip"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 13px',
                borderRadius: 999,
                background: palette.cockpit,
                color: palette.cockpitText,
                fontFamily: monoFont,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.04em',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,.1), 0 2px 6px rgba(0,0,0,.3)',
              }}
            >
              <OpticalLed tone="emerald" size={10} pulse label="Observer online" />
              <Eye size={14} aria-hidden="true" />
              OBSERVER (SUBSCRIBE-ONLY)
            </span>

            <div
              role="status"
              aria-live="polite"
              aria-label={`Packets published by observer: ${observerPacketsPublished}`}
              className="se-anim"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 14px',
                borderRadius: 12,
                background: palette.cockpit,
                color: proofColor,
                fontFamily: monoFont,
                fontWeight: 800,
                fontSize: 13,
                letterSpacing: '0.03em',
                animation: violated ? 'se-violation 0.8s linear infinite' : 'se-proof-flash 2.4s ease-in-out infinite',
              }}
            >
              {violated ? <ShieldAlert size={18} aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}
              <span style={{ color: palette.cockpitText, fontWeight: 600 }}>PACKETS PUBLISHED BY OBSERVER:</span>
              <span style={{ fontSize: 24, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {observerPacketsPublished}
              </span>
            </div>
          </div>

          {/* Mesh + timeline */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <CockpitChip tone={meshTone} title="Mesh convergence state">
              <Network size={13} aria-hidden="true" />
              MESH {meshState} · {meshPeerCount} {meshPeerCount === 1 ? 'peer' : 'peers'}
            </CockpitChip>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 12px',
                  borderRadius: 10,
                  background: palette.cockpit,
                  color: palette.cockpitText,
                  fontFamily: monoFont,
                  fontSize: 15,
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <Clock size={15} aria-hidden="true" />
                <time>{formatClock(timelineSeconds)}</time>
                <span style={{ fontSize: 11, color: toneColor[isLive ? 'emerald' : 'amber'] }}>
                  {isLive ? 'LIVE' : 'PAUSED'} ×{playbackSpeed}
                </span>
              </span>
              {onTogglePlayback ? (
                <button
                  type="button"
                  className="se-btn"
                  onClick={onTogglePlayback}
                  aria-label={isLive ? 'Pause timeline' : 'Resume timeline'}
                >
                  {isLive ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                  {isLive ? 'Pause' : 'Resume'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </SkinGlassCard>
    </header>
  );
}

export default GhostNodeHeader;
