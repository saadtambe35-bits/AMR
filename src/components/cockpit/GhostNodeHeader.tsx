import { Clock, Eye, Network, Pause, Play, Radar, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { MeshState } from './types';
import {
  CockpitChip,
  CockpitStyles,
  OpticalLed,
  SkinGlassCard,
  formatClock,
  monoFont,
  palette,
  toneColor,
} from './cockpitKit';
import type { Tone } from './cockpitKit';

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
                width: 40,
                height: 40,
                borderRadius: 12,
                background: '#ede9df',
                color: '#292524',
                border: '1px solid rgba(215, 208, 195, 0.9)',
                boxShadow: 'inset 1px 1px 2px rgba(255,255,255,0.9), 0 2px 5px rgba(150,135,115,0.15)',
              }}
            >
              <Radar size={20} />
            </span>
            <div style={{ minWidth: 0 }}>
              <h1 className="text-stone-900 font-extrabold" style={{ margin: 0, fontSize: 18, letterSpacing: '-0.02em' }}>
                SwarmEdge <span style={{ color: '#0ea5e9', fontWeight: 700, fontSize: 13 }}>v02</span>
              </h1>
              <p style={{ margin: 0, fontSize: 12, color: '#78716c', fontWeight: 500 }}>
                {scenarioName ? `Fleet cockpit · ${scenarioName}` : 'Fleet cockpit'}
              </p>
            </div>
          </div>

          {/* Ghost-node proof */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
            <span className="cockpit-dark-chip">
              <span className="led-jewel led-jewel-emerald" />
              <Eye size={13} aria-hidden="true" />
              OBSERVER (SUBSCRIBE-ONLY)
            </span>

            <div
              role="status"
              aria-live="polite"
              aria-label={`Packets published by observer: ${observerPacketsPublished}`}
              className="se-anim cockpit-dark-chip"
              style={{
                padding: '6px 14px',
                fontSize: 12,
                color: proofColor,
                animation: violated ? 'se-violation 0.8s linear infinite' : undefined,
              }}
            >
              {violated ? <ShieldAlert size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
              <span style={{ color: 'rgba(235, 220, 200, 0.92)', fontWeight: 600 }}>PACKETS PUBLISHED:</span>
              <span className="tabular-nums font-mono font-bold" style={{ fontSize: 16, lineHeight: 1 }}>
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
              <span className="cockpit-dark-chip" style={{ fontSize: 13 }}>
                <span className="led-jewel led-jewel-emerald" />
                <Clock size={13} aria-hidden="true" />
                <time className="tabular-nums font-mono text-[#f3ede2] font-bold">{formatClock(timelineSeconds)}</time>
                <span style={{ fontSize: 10, color: toneColor[isLive ? 'emerald' : 'amber'], fontWeight: 800 }}>
                  {isLive ? 'LIVE' : 'PAUSED'} ×{playbackSpeed}
                </span>
              </span>
              {onTogglePlayback ? (
                <button
                  type="button"
                  className="tactile-convex-btn"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, cursor: 'pointer' }}
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
