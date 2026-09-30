import type { CSSProperties, ReactNode } from 'react';

/**
 * Cockpit primitives for Block 4. They render the existing design-system classes
 * (.skin-glass-card, .specular-sheen, .neumorphic-inset, .cockpit-dark-chip, .led-*)
 * and add their own self-sufficient styling, so they work even before index.css is loaded.
 * If your ui/ folder exposes SkinGlassCard / RecessedWell, swap the two exports below.
 */

export type Tone = 'emerald' | 'amber' | 'rose' | 'sky' | 'neutral';

export const palette = {
  ink: '#231f1c', // deep espresso stone
  inkSoft: '#57534e', // warm stone body
  inkFaint: '#8f887f', // stone metadata
  sand: '#eae5d9',
  sandDeep: '#f5f3ec',
  cockpit: '#16120f',
  cockpitText: '#f5f0e6',
  emerald: '#10b981',
  amber: '#f59e0b',
  rose: '#ef4444',
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
@keyframes se-pip-pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(16,185,129,.7); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); } }
@keyframes se-proof-flash { 0%,100% { box-shadow: 0 0 0 1px rgba(16,185,129,.6), 0 0 14px rgba(16,185,129,.35); } 50% { box-shadow: 0 0 0 1px rgba(52,211,153,1), 0 0 26px rgba(16,185,129,.75); } }
@keyframes se-violation { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
@keyframes se-modal-in { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: none; } }
.se-glass { position: relative; border-radius: 18px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.45) 60%, rgba(245, 243, 236, 0.35) 100%); border: 1px solid rgba(255, 255, 255, 0.88); box-shadow: 0 20px 40px -15px rgba(135, 120, 100, 0.16), 0 6px 14px -4px rgba(135, 120, 100, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.98), inset 0 -1px 2px rgba(180, 165, 145, 0.12); backdrop-filter: blur(28px) saturate(160%); -webkit-backdrop-filter: blur(28px) saturate(160%); color: ${palette.ink}; transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.24s cubic-bezier(0.2, 0.8, 0.2, 1); }
.se-glass:hover { transform: translateY(-3px); box-shadow: 0 28px 56px -15px rgba(135, 120, 100, 0.22), 0 8px 18px -4px rgba(135, 120, 100, 0.1), inset 0 1px 2px rgba(255, 255, 255, 1), inset 0 -1px 2px rgba(180, 165, 145, 0.15); }
.se-sheen { position: absolute; left: 0; right: 0; top: 0; height: 1.5px; pointer-events: none; z-index: 2; background: linear-gradient(90deg, transparent 2%, rgba(255,255,255,0.4) 15%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 85%, transparent 98%); filter: drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8)); }
.se-well { border-radius: 9999px; background: #eae5d9; border: 1px solid rgba(255, 255, 255, 0.6); border-top-color: rgba(160, 148, 130, 0.28); border-left-color: rgba(160, 148, 130, 0.22); box-shadow: inset 3px 3px 6px rgba(150, 138, 120, 0.25), inset -2px -2px 5px rgba(255, 255, 255, 0.92), 0 1px 2px rgba(255, 255, 255, 0.8); overflow: hidden; }
.se-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; background: linear-gradient(160deg, #241d18 0%, #16120f 100%); border: 1px solid rgba(217, 180, 150, 0.35); color: rgba(235, 220, 200, 0.92); font-family: ${monoFont}; font-size: 11px; font-weight: 700; line-height: 1.4; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.15); text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6); white-space: nowrap; }
.se-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 6px 13px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.7); background: linear-gradient(145deg, #faf8f2, #ede9df); color: #231f1c; font: 700 12px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 3px 3px 7px rgba(160, 148, 130, 0.16), -2px -2px 6px rgba(255, 255, 255, 0.9); transition: all .15s ease; }
.se-btn:hover { background: #ffffff; border-color: rgba(185, 175, 160, 0.9); transform: translateY(-1px); box-shadow: 4px 4px 10px rgba(160, 148, 130, 0.22), -3px -3px 8px rgba(255, 255, 255, 1); }
.se-btn:active { transform: translateY(1px); box-shadow: inset 1px 1px 3px rgba(150, 138, 120, 0.25), inset -1px -1px 2px rgba(255, 255, 255, 0.8); }
.se-btn:focus-visible, .se-row:focus-visible { outline: 2px solid ${palette.sky}; outline-offset: 2px; }
.se-btn--danger { background: radial-gradient(circle at 35% 25%, #ff5258 0%, #e11d48 55%, #9f1239 100%); color: #ffffff; border: 1px solid #881337; box-shadow: 0 5px 0 #700c28, 0 10px 20px rgba(225, 29, 72, 0.35), inset 0 2px 0 rgba(255, 255, 255, 0.45); }
.se-btn--danger:hover { background: radial-gradient(circle at 35% 25%, #ff6b70 0%, #f43f5e 55%, #be123c 100%); box-shadow: 0 6px 0 #700c28, 0 14px 26px rgba(225, 29, 72, 0.45), inset 0 2px 0 rgba(255, 255, 255, 0.5); transform: translateY(-1px); }
.se-btn--danger:active { transform: translateY(2px); box-shadow: 0 2px 0 #700c28, 0 4px 8px rgba(112, 12, 40, 0.4), inset 0 2px 0 rgba(255, 255, 255, 0.45); }
.se-btn--armed { background: radial-gradient(circle at 35% 25%, #ef4444, #b91c1c); color: #fff; border-color: #ef4444; box-shadow: 0 0 16px rgba(239,68,68,.5); }
.se-btn--warn { background: linear-gradient(145deg, #faf8f2, #ede9df); border-color: rgba(217, 119, 6, 0.4); color: #b45309; }
.se-btn[disabled] { opacity: .45; cursor: not-allowed; transform: none; }
.se-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12.5px; }
.se-table th { text-align: left; font-weight: 700; color: ${palette.inkSoft}; padding: 8px 12px; border-bottom: 1px solid rgba(215, 208, 195, 0.8); font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }
.se-table td { padding: 9px 12px; border-bottom: 1px solid rgba(215, 208, 195, 0.4); color: ${palette.ink}; vertical-align: middle; }
.se-table tr:hover td { background: rgba(255, 255, 255, 0.5); }
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
  const accentShadow = accent && accent !== 'neutral' ? `, 0 0 0 2px ${toneColor[accent]}` : '';
  return (
    <div
      className={['skin-glass-card', 'specular-sheen', 'se-glass', className].filter(Boolean).join(' ')}
      style={{
        padding,
        ...(accentShadow
          ? { boxShadow: `0 20px 40px -15px rgba(135, 120, 100, 0.16), 0 6px 14px -4px rgba(135, 120, 100, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.98)${accentShadow}` }
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

/** Optical LED convex lens with specular center highlight and outer bloom. */
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
        background: `radial-gradient(circle at 35% 35%, #ffffff 0%, ${c} 55%, rgba(0,0,0,0.4) 100%)`,
        boxShadow: `0 0 ${size * 1.2}px ${c}, 0 0 ${size * 2}px ${c}88, inset 0 1px 1px rgba(255,255,255,0.9)`,
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
