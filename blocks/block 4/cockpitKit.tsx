import type { CSSProperties, ReactNode } from 'react';

/**
 * Cockpit primitives for Block 4. They render the existing design-system classes
 * (.skin-glass-card, .specular-sheen, .neumorphic-inset, .cockpit-dark-chip, .led-*)
 * and add their own self-sufficient styling, so they work even before index.css is loaded.
 * If your ui/ folder exposes SkinGlassCard / RecessedWell, swap the two exports below.
 */

export type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'neutral';

export const palette = {
  ink: '#2a1f16',
  inkSoft: '#6d5a47',
  inkFaint: '#9a866f',
  sand: '#efe3cf',
  sandDeep: '#dfcdb0',
  cockpit: '#1d1712',
  cockpitText: '#f6ebd7',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#e11d48',
  sky: '#0ea5e9',
} as const;

export const toneColor: Record<Tone, string> = {
  emerald: palette.emerald,
  amber: palette.amber,
  rose: palette.rose,
  sky: palette.sky,
  neutral: palette.inkFaint,
};

export const NEAR_MISS_M = 0.5;
export const WARN_SEPARATION_M = 1.0;

/** Amber below 1.0 m, red at near-miss range (< 0.5 m). */
export function separationTone(meters: number): Tone {
  if (meters < NEAR_MISS_M) return 'rose';
  if (meters < WARN_SEPARATION_M) return 'amber';
  return 'emerald';
}

/** Green > 40 %, amber 20–40 %, red < 20 %. */
export function batteryTone(pct: number): Tone {
  if (pct > 40) return 'emerald';
  if (pct >= 20) return 'amber';
  return 'rose';
}

export const monoFont =
  "ui-monospace, 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace";

export function CockpitStyles(): ReactNode {
  return (
    <style href="swarmedge-cockpit-kit" precedence="default">{`
@keyframes se-pip-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,.55); } 50% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } }
@keyframes se-proof-flash { 0%,100% { box-shadow: 0 0 0 1px rgba(16,185,129,.6), 0 0 14px rgba(16,185,129,.35); } 50% { box-shadow: 0 0 0 1px rgba(52,211,153,1), 0 0 26px rgba(16,185,129,.75); } }
@keyframes se-violation { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes se-modal-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
.se-glass { position: relative; border-radius: 18px; background: linear-gradient(155deg, rgba(255,251,243,.78), rgba(244,231,208,.55)); border: 1px solid rgba(255,255,255,.65); box-shadow: 0 10px 28px rgba(92,64,30,.16), inset 0 1px 0 rgba(255,255,255,.85); backdrop-filter: blur(14px) saturate(140%); -webkit-backdrop-filter: blur(14px) saturate(140%); color: ${palette.ink}; }
.se-sheen { position: absolute; left: 14px; right: 14px; top: 0; height: 1px; pointer-events: none; background: linear-gradient(90deg, transparent, rgba(255,255,255,.98) 30%, rgba(255,255,255,.98) 70%, transparent); }
.se-well { border-radius: 999px; background: linear-gradient(180deg, #d8c6a8, #e6d7bd); box-shadow: inset 2px 3px 6px rgba(92,64,30,.35), inset -2px -2px 5px rgba(255,255,255,.7); overflow: hidden; }
.se-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px; border-radius: 8px; background: ${palette.cockpit}; color: ${palette.cockpitText}; font-family: ${monoFont}; font-size: 11.5px; line-height: 1.4; box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 1px 2px rgba(0,0,0,.25); white-space: nowrap; }
.se-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 11px; border-radius: 10px; border: 1px solid rgba(92,64,30,.22); background: linear-gradient(180deg, #fff8ea, #ecdcc0); color: ${palette.ink}; font: 600 12px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 5px rgba(92,64,30,.18), inset 0 1px 0 rgba(255,255,255,.9); transition: transform .12s ease, box-shadow .12s ease, background .12s ease; }
.se-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 9px rgba(92,64,30,.24), inset 0 1px 0 rgba(255,255,255,.95); }
.se-btn:active { transform: translateY(0); box-shadow: inset 1px 2px 4px rgba(92,64,30,.3); }
.se-btn:focus-visible, .se-row:focus-visible { outline: 2px solid ${palette.sky}; outline-offset: 2px; }
.se-btn--danger { color: #9f1239; border-color: rgba(225,29,72,.35); }
.se-btn--armed { background: linear-gradient(180deg, #fb7185, #e11d48); color: #fff; border-color: #be123c; }
.se-btn--warn { color: #92400e; border-color: rgba(245,158,11,.5); }
.se-btn[disabled] { opacity: .5; cursor: not-allowed; transform: none; }
.se-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.se-table th { text-align: left; font-weight: 600; color: ${palette.inkSoft}; padding: 6px 10px; border-bottom: 1px solid rgba(92,64,30,.2); white-space: nowrap; }
.se-table td { padding: 8px 10px; border-bottom: 1px solid rgba(92,64,30,.1); vertical-align: middle; }
.se-table tr:last-child td { border-bottom: none; }
@media (prefers-reduced-motion: reduce) { .se-anim { animation: none !important; } .se-btn { transition: none; } }
`}</style>
  );
}

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: number | string;
  /** Optional colored edge to signal state (e.g. fault). */
  accent?: Tone;
}

/** Skin-glass card with a specular sheen hairline along the top edge. */
export function SkinGlassCard({ children, className, style, padding = 16, accent }: SurfaceProps) {
  const accentShadow = accent && accent !== 'neutral' ? `, 0 0 0 1.5px ${toneColor[accent]}66` : '';
  return (
    <div
      className={['skin-glass-card', 'specular-sheen', 'se-glass', className].filter(Boolean).join(' ')}
      style={{
        padding,
        ...(accentShadow
          ? { boxShadow: `0 10px 28px rgba(92,64,30,.16), inset 0 1px 0 rgba(255,255,255,.85)${accentShadow}` }
          : null),
        ...style,
      }}
    >
      <span className="se-sheen" aria-hidden="true" />
      {children}
    </div>
  );
}

interface WellProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  height?: number;
}

/** Recessed neumorphic track (battery, gauges). */
export function RecessedWell({ children, className, style, height = 12 }: WellProps) {
  return (
    <div
      className={['neumorphic-inset', 'se-well', className].filter(Boolean).join(' ')}
      style={{ height, ...style }}
    >
      {children}
    </div>
  );
}

interface LedProps {
  tone: Tone;
  size?: number;
  pulse?: boolean;
  label?: string;
}

/** Optical LED lens. Decorative unless `label` is given. */
export function OpticalLed({ tone, size = 10, pulse = false, label }: LedProps) {
  const c = toneColor[tone];
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={[`led-${tone === 'neutral' ? 'sky' : tone}`, pulse ? 'se-anim' : ''].filter(Boolean).join(' ')}
      style={{
        display: 'inline-block',
        flex: 'none',
        width: size,
        height: size,
        borderRadius: '50%',
        background: `radial-gradient(circle at 32% 28%, #ffffffcc 0 12%, ${c} 38%, ${c}cc 100%)`,
        boxShadow: `0 0 ${size}px ${c}88, inset 0 -2px 3px rgba(0,0,0,.25)`,
        animation: pulse ? 'se-pip-pulse 1.8s ease-out infinite' : undefined,
      }}
    />
  );
}

interface ChipProps {
  children: ReactNode;
  tone?: Tone;
  title?: string;
}

/** Dark monospace telemetry chip with optional colored dot. */
export function CockpitChip({ children, tone, title }: ChipProps) {
  return (
    <span className="cockpit-dark-chip se-chip" title={title}>
      {tone ? (
        <span
          aria-hidden="true"
          style={{ width: 6, height: 6, borderRadius: '50%', background: toneColor[tone], boxShadow: `0 0 6px ${toneColor[tone]}` }}
        />
      ) : null}
      {children}
    </span>
  );
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}
