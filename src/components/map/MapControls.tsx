import React, { useEffect, useState } from 'react';

export type ScenarioId = 'S-A' | 'S-B' | 'S-C' | 'S-D' | 'S-E';
export type SpeedMultiplier = 1 | 2 | 5;

export const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: 'S-A', label: 'S-A · 4-Way Crossing' },
  { id: 'S-B', label: 'S-B · Narrow Aisle Head-On' },
  { id: 'S-C', label: 'S-C · Pick-and-Drop 20% Challenge' },
  { id: 'S-D', label: 'S-D · Blocked Aisle' },
  { id: 'S-E', label: 'S-E · Robot Kill' },
];

const SPEEDS: SpeedMultiplier[] = [1, 2, 5];

export interface MapControlsProps {
  running: boolean;
  speed: SpeedMultiplier;
  scenario: ScenarioId;
  seed: number;
  pairedLocked: boolean;
  simTimeS?: number;
  showHeatmap: boolean;
  onPlayPause: () => void;
  onStep: () => void;
  onReset: () => void;
  onSpeedChange: (s: SpeedMultiplier) => void;
  onScenarioChange: (s: ScenarioId) => void;
  onSeedChange: (seed: number) => void;
  onPairedLockChange: (locked: boolean) => void;
  onToggleHeatmap: () => void;
  style?: React.CSSProperties;
}

const glass: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 12,
  padding: '10px 18px',
  borderRadius: 18,
  background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.45) 60%, rgba(245, 243, 236, 0.35) 100%)',
  backdropFilter: 'blur(28px) saturate(160%)',
  WebkitBackdropFilter: 'blur(28px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.88)',
  boxShadow: '0 20px 40px -15px rgba(135, 120, 100, 0.16), 0 6px 14px -4px rgba(135, 120, 100, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.98), inset 0 -1px 2px rgba(180, 165, 145, 0.12)',
  color: '#231f1c',
  fontFamily: 'Inter, system-ui, sans-serif',
};

const actionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '6px 14px',
  borderRadius: 12,
  background: 'linear-gradient(145deg, #faf8f2, #ede9df)',
  border: '1px solid rgba(255, 255, 255, 0.75)',
  color: '#231f1c',
  font: '600 12px ui-monospace, monospace',
  cursor: 'pointer',
  boxShadow: '3px 3px 8px rgba(160, 148, 130, 0.16), -2px -2px 6px rgba(255, 255, 255, 0.9)',
  transition: 'all 140ms cubic-bezier(0.2, 0.8, 0.2, 1)',
};

const chipBase: React.CSSProperties = {
  border: '1px solid rgba(215, 208, 195, 0.85)',
  borderRadius: 8,
  padding: '5px 12px',
  background: 'linear-gradient(145deg, #faf8f2, #ede9df)',
  color: '#231f1c',
  font: '600 12px ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: 0.3,
  cursor: 'pointer',
  boxShadow: '2px 2px 5px rgba(140, 125, 105, 0.1), -1px -1px 3px rgba(255, 255, 255, 0.9)',
  transition: 'all 120ms ease',
};

const chip = (active = false, accent = '#10b981'): React.CSSProperties => ({
  ...chipBase,
  ...(active
    ? {
        background: '#ffffff',
        color: '#231f1c',
        borderColor: 'rgba(185, 175, 160, 0.9)',
        boxShadow: '0 2px 6px rgba(140, 125, 105, 0.18), inset 0 1px 1px rgba(255, 255, 255, 1)',
        fontWeight: 700,
      }
    : null),
});

const label: React.CSSProperties = {
  font: '700 10.5px ui-monospace, monospace',
  letterSpacing: 0.8,
  textTransform: 'uppercase',
  color: '#57534e',
};

const MapControls: React.FC<MapControlsProps> = ({
  running,
  speed,
  scenario,
  seed,
  pairedLocked,
  simTimeS,
  showHeatmap,
  onPlayPause,
  onStep,
  onReset,
  onSpeedChange,
  onScenarioChange,
  onSeedChange,
  onPairedLockChange,
  onToggleHeatmap,
  style,
}) => {
  const [seedText, setSeedText] = useState(String(seed));
  useEffect(() => setSeedText(String(seed)), [seed]);

  const commitSeed = () => {
    const n = Math.trunc(Number(seedText));
    if (Number.isFinite(n) && n >= 0) onSeedChange(n);
    else setSeedText(String(seed));
  };

  return (
    <div style={{ ...glass, ...style }} role="toolbar" aria-label="Simulation controls" className="skin-glass-card specular-sheen">
      {/* Transport */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          type="button"
          className="tactile-convex-btn"
          style={{
            ...actionBtn,
            background: running ? 'linear-gradient(145deg, #f0fdf4, #dcfce7)' : undefined,
            color: running ? '#047857' : '#2b2621',
            borderColor: running ? 'rgba(16, 185, 129, 0.45)' : undefined,
            boxShadow: running
              ? 'inset 2px 2px 4px rgba(16, 185, 129, 0.15), 0 2px 6px rgba(16, 185, 129, 0.2)'
              : undefined,
          }}
          onClick={onPlayPause}
          aria-pressed={running}
        >
          {running ? '❚❚ PAUSE' : '▶ PLAY'}
        </button>
        <button
          type="button"
          className="tactile-convex-btn"
          style={{ ...actionBtn, opacity: running ? 0.45 : 1 }}
          onClick={onStep}
          disabled={running}
        >
          ⏭ STEP
        </button>
        <button type="button" className="tactile-convex-btn" style={actionBtn} onClick={onReset}>
          ↺ RESET
        </button>
      </div>

      {/* Speed dial */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={label}>Speed</span>
        <div className="neumorphic-inset" style={{ display: 'inline-flex', padding: 3, borderRadius: 8, gap: 2 }}>
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className={speed === s ? 'tactile-convex-btn' : ''}
              style={{
                border: 'none',
                background: speed === s ? '#ffffff' : 'transparent',
                color: speed === s ? '#2b2621' : '#6e675f',
                borderRadius: 6,
                padding: '4px 10px',
                font: '700 11.5px ui-monospace, monospace',
                cursor: 'pointer',
                boxShadow: speed === s ? '0 1px 3px rgba(140, 125, 105, 0.25), inset 0 1px 1px rgba(255, 255, 255, 1)' : 'none',
                transition: 'all 120ms ease',
              }}
              onClick={() => onSpeedChange(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Scenario */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={label}>Scenario</span>
        <select
          value={scenario}
          onChange={(e) => onScenarioChange(e.target.value as ScenarioId)}
          className="tactile-convex-btn"
          style={{
            ...actionBtn,
            padding: '6px 12px',
            appearance: 'auto',
          }}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      {/* Seed + paired lock */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={label}>Seed</span>
        <input
          type="number"
          min={0}
          step={1}
          value={seedText}
          disabled={pairedLocked}
          onChange={(e) => setSeedText(e.target.value)}
          onBlur={commitSeed}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur(), undefined)}
          className="neumorphic-inset"
          style={{
            width: 82,
            padding: '5px 8px',
            textAlign: 'right',
            cursor: pairedLocked ? 'not-allowed' : 'text',
            opacity: pairedLocked ? 0.6 : 1,
            font: '600 12px ui-monospace, monospace',
            color: '#2b2621',
          }}
        />
        <button
          type="button"
          className="tactile-convex-btn"
          style={{
            ...actionBtn,
            color: pairedLocked ? '#b45309' : '#2b2621',
            borderColor: pairedLocked ? 'rgba(217, 119, 6, 0.45)' : undefined,
            fontWeight: pairedLocked ? 700 : 600,
          }}
          onClick={() => onPairedLockChange(!pairedLocked)}
          aria-pressed={pairedLocked}
          title="Paired Run: keep the same seed across runs for like-for-like comparison"
        >
          {pairedLocked ? '🔒 PAIRED' : '🔓 PAIRED'}
        </button>
      </div>

      <button
        type="button"
        className="tactile-convex-btn"
        style={{
          ...actionBtn,
          color: showHeatmap ? '#b45309' : '#2b2621',
          borderColor: showHeatmap ? 'rgba(245, 158, 11, 0.55)' : undefined,
          fontWeight: showHeatmap ? 700 : 600,
        }}
        onClick={onToggleHeatmap}
        aria-pressed={showHeatmap}
      >
        ♨ HEATMAP
      </button>

      {simTimeS !== undefined && (
        <span className="ml-auto tabular-nums font-mono text-stone-800 font-bold text-xs">
          T+ {simTimeS.toFixed(1)}s
        </span>
      )}
    </div>
  );
};

export default MapControls;
