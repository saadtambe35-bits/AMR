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
  padding: '10px 14px',
  borderRadius: 20,
  background: 'linear-gradient(145deg, rgba(255,255,255,0.62), rgba(255,250,235,0.34))',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.75)',
  boxShadow: '6px 6px 16px rgba(120,95,50,0.16), -4px -4px 12px rgba(255,255,255,0.8)',
  color: '#3a362d',
  fontFamily: 'system-ui, sans-serif',
};

const chipBase: React.CSSProperties = {
  border: 'none',
  borderRadius: 999,
  padding: '7px 14px',
  background: '#2b2925',
  color: '#f5f0dc',
  font: '600 12px ui-monospace, SFMono-Regular, Menlo, monospace',
  letterSpacing: 0.3,
  cursor: 'pointer',
  boxShadow: '0 2px 6px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
};

const chip = (active = false, accent = '#d69e2e'): React.CSSProperties => ({
  ...chipBase,
  ...(active ? { background: accent, color: '#231f17' } : null),
});

const label: React.CSSProperties = {
  font: '600 10px ui-monospace, monospace',
  letterSpacing: 1,
  textTransform: 'uppercase',
  opacity: 0.6,
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
    <div style={{ ...glass, ...style }} role="toolbar" aria-label="Simulation controls">
      {/* Transport */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button type="button" style={chip(running, '#10b981')} onClick={onPlayPause} aria-pressed={running}>
          {running ? '❚❚ PAUSE' : '▶ PLAY'}
        </button>
        <button type="button" style={{ ...chip(), opacity: running ? 0.45 : 1 }} onClick={onStep} disabled={running}>
          ⏭ STEP
        </button>
        <button type="button" style={chip()} onClick={onReset}>
          ↺ RESET
        </button>
      </div>

      {/* Speed dial */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={label}>Speed</span>
        {SPEEDS.map((s) => (
          <button key={s} type="button" style={chip(speed === s)} onClick={() => onSpeedChange(s)}>
            {s}x
          </button>
        ))}
      </div>

      {/* Scenario */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={label}>Scenario</span>
        <select
          value={scenario}
          onChange={(e) => onScenarioChange(e.target.value as ScenarioId)}
          style={{
            ...chipBase,
            padding: '7px 12px',
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
          style={{
            ...chipBase,
            width: 92,
            textAlign: 'right',
            cursor: pairedLocked ? 'not-allowed' : 'text',
            opacity: pairedLocked ? 0.6 : 1,
          }}
        />
        <button
          type="button"
          style={chip(pairedLocked, '#b7791f')}
          onClick={() => onPairedLockChange(!pairedLocked)}
          aria-pressed={pairedLocked}
          title="Paired Run: keep the same seed across runs for like-for-like comparison"
        >
          {pairedLocked ? '🔒 PAIRED' : '🔓 PAIRED'}
        </button>
      </div>

      <button type="button" style={chip(showHeatmap, '#f59e0b')} onClick={onToggleHeatmap} aria-pressed={showHeatmap}>
        ♨ HEATMAP
      </button>

      {simTimeS !== undefined && (
        <span style={{ marginLeft: 'auto', font: '600 12px ui-monospace, monospace' }}>
          T+ {simTimeS.toFixed(1)}s
        </span>
      )}
    </div>
  );
};

export default MapControls;
