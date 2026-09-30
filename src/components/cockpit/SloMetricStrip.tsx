import { Cpu, Gauge, Radio, Ruler, ShieldCheck, ShieldX, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CockpitStyles,
  OpticalLed,
  RecessedWell,
  SkinGlassCard,
  monoFont,
  palette,
  separationTone,
  toneColor,
} from './cockpitKit';
import type { Tone } from './cockpitKit';

export interface SloMetricStripProps {
  collisions?: number;
  /** Closest pairwise distance in meters; null when fewer than two robots are online. */
  minSeparationM?: number | null;
  activeRobots?: number;
  totalRobots?: number;
  packetRateHz?: number;
  worstCpuPct?: number;
  worstCpuRobotId?: string;
}

const SEPARATION_SCALE_M = 3;

function cpuTone(pct: number): Tone {
  if (pct >= 90) return 'rose';
  if (pct >= 70) return 'amber';
  return 'emerald';
}

interface TileProps {
  icon: ReactNode;
  label: string;
  tone: Tone;
  children: ReactNode;
  footer?: ReactNode;
}

function Tile({ icon, label, tone, children, footer }: TileProps) {
  return (
    <div className="skin-glass-card h-full p-4 sm:p-5 flex flex-col justify-between hover:-translate-y-1 transition-all duration-200">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6e675f', fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          <span aria-hidden="true" style={{ display: 'inline-flex', color: toneColor[tone] }}>{icon}</span>
          {label}
        </div>
        <div style={{ marginTop: 8 }}>{children}</div>
      </div>
      {footer ? <div style={{ marginTop: 10 }}>{footer}</div> : null}
    </div>
  );
}

const bigNumber = {
  fontFamily: monoFont,
  fontSize: 32,
  fontWeight: 800,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.03em',
  color: '#2b2621',
} as const;

export function SloMetricStrip({
  collisions = 0,
  minSeparationM = 1.84,
  activeRobots = 4,
  totalRobots = 4,
  packetRateHz = 120,
  worstCpuPct = 24.8,
  worstCpuRobotId = 'amr_02',
}: SloMetricStripProps = {}) {
  const collisionTone: Tone = collisions === 0 ? 'emerald' : 'rose';
  const sepTone: Tone = minSeparationM === null ? 'neutral' : separationTone(minSeparationM);
  const sepFill =
    minSeparationM === null ? 0 : Math.min(100, Math.max(0, (minSeparationM / SEPARATION_SCALE_M) * 100));
  const fleetTone: Tone = totalRobots > 0 && activeRobots < totalRobots ? 'amber' : 'emerald';
  const cpuT = cpuTone(worstCpuPct);

  return (
    <section
      aria-label="Service level objectives"
      className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5"
    >
      <CockpitStyles />

      {/* 1. Collisions */}
      <Tile
        icon={collisions === 0 ? <ShieldCheck size={16} /> : <ShieldX size={16} />}
        label="Collisions"
        tone={collisionTone}
        footer={
          collisions === 0 ? (
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold bg-emerald-500/15 text-emerald-900 border border-emerald-500/30 rounded-md tracking-tight">
              0-collision guarantee holding
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-bold bg-rose-500/15 text-rose-900 border border-rose-500/30 rounded-md tracking-tight">
              Guarantee broken
            </span>
          )
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="led-jewel led-jewel-emerald" style={{ width: 14, height: 14 }} />
          <span style={{ ...bigNumber, color: collisions === 0 ? '#10B981' : '#EF4444', fontSize: 38 }} aria-live="polite">
            {collisions}
          </span>
        </div>
      </Tile>

      {/* 2. Min Separation / Makespan Expansion */}
      <Tile
        icon={<Ruler size={16} />}
        label="Min separation"
        tone={sepTone}
        footer={
          <div className="neumorphic-inset" style={{ height: 8 }}>
            <div
              style={{
                width: `${sepFill}%`,
                height: '100%',
                borderRadius: 999,
                background: 'linear-gradient(90deg, #10B981, #F59E0B)',
                boxShadow: '0 0 10px rgba(16, 185, 129, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.7)',
                transition: 'width .25s ease',
              }}
            />
          </div>
        }
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={bigNumber}>
            {minSeparationM === null ? '—' : minSeparationM.toFixed(2)}
          </span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: '#6e675f', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>m</span>
        </div>
      </Tile>

      {/* 3. Active Fleet */}
      <Tile
        icon={<Users size={16} />}
        label="Active fleet"
        tone={fleetTone}
        footer={
          <span style={{ fontSize: 11.5, color: '#6e675f', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <span className="led-jewel led-jewel-emerald" />
            {totalRobots} registered peers
          </span>
        }
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={bigNumber}>{activeRobots}</span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: '#6e675f', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>/ {totalRobots} online</span>
        </div>
      </Tile>

      {/* 4. Mesh Packet Rate */}
      <Tile
        icon={<Radio size={16} />}
        label="Mesh packet rate"
        tone="sky"
        footer={
          <span style={{ fontSize: 11.5, color: '#6e675f', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <span className="led-jewel led-jewel-emerald" />
            Heard by observer
          </span>
        }
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={bigNumber}>{Math.round(packetRateHz)}</span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: '#6e675f', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>pkts/s</span>
        </div>
      </Tile>

      {/* 5. Worst-case CPU */}
      <Tile
        icon={<Cpu size={16} />}
        label="Worst-case CPU"
        tone={cpuT}
        footer={
          <div style={{ display: 'grid', gap: 6 }}>
            <div className="neumorphic-inset" style={{ height: 8 }}>
              <div
                style={{
                  width: `${Math.min(100, (worstCpuPct / 40) * 100)}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #F59E0B, #EF4444)',
                  boxShadow: '0 0 10px rgba(245, 158, 11, 0.45), inset 0 1px 1px rgba(255, 255, 255, 0.7)',
                  transition: 'width .25s ease',
                }}
              />
            </div>
            <span style={{ fontSize: 11, color: '#57534e', display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
              <Gauge size={12} aria-hidden="true" />
              {worstCpuRobotId ? `${worstCpuRobotId} · Pi-class core` : 'Pi-class core'}
            </span>
          </div>
        }
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigNumber, color: cpuT === 'rose' ? '#EF4444' : '#231f1c' }}>
            {worstCpuPct.toFixed(1)}
          </span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: '#57534e', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>%</span>
        </div>
      </Tile>
    </section>
  );
}

export default SloMetricStrip;
