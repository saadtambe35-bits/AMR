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
} from '../cockpit/cockpitKit';
import type { Tone } from '../cockpit/cockpitKit';

export interface SloMetricStripProps {
  collisions: number;
  /** Closest pairwise distance in meters; null when fewer than two robots are online. */
  minSeparationM: number | null;
  activeRobots: number;
  totalRobots: number;
  packetRateHz: number;
  worstCpuPct: number;
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
    <SkinGlassCard padding="12px 14px" accent={tone === 'rose' ? 'rose' : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: palette.inkSoft, fontSize: 12, fontWeight: 600 }}>
        <span aria-hidden="true" style={{ display: 'inline-flex', color: toneColor[tone] }}>{icon}</span>
        {label}
      </div>
      <div style={{ marginTop: 6 }}>{children}</div>
      {footer ? <div style={{ marginTop: 8 }}>{footer}</div> : null}
    </SkinGlassCard>
  );
}

const bigNumber = {
  fontFamily: monoFont,
  fontSize: 30,
  fontWeight: 800,
  lineHeight: 1,
  fontVariantNumeric: 'tabular-nums',
  color: palette.ink,
} as const;

export function SloMetricStrip({
  collisions,
  minSeparationM,
  activeRobots,
  totalRobots,
  packetRateHz,
  worstCpuPct,
  worstCpuRobotId,
}: SloMetricStripProps) {
  const collisionTone: Tone = collisions === 0 ? 'emerald' : 'rose';
  const sepTone: Tone = minSeparationM === null ? 'neutral' : separationTone(minSeparationM);
  const sepFill =
    minSeparationM === null ? 0 : Math.min(100, Math.max(0, (minSeparationM / SEPARATION_SCALE_M) * 100));
  const fleetTone: Tone = totalRobots > 0 && activeRobots < totalRobots ? 'amber' : 'emerald';
  const cpuT = cpuTone(worstCpuPct);

  return (
    <section
      aria-label="Service level objectives"
      style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}
    >
      <CockpitStyles />

      <Tile
        icon={collisions === 0 ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
        label="Collisions"
        tone={collisionTone}
        footer={
          <span style={{ fontSize: 11.5, color: palette.inkSoft }}>
            {collisions === 0 ? '0-collision guarantee holding' : 'Guarantee broken'}
          </span>
        }
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <OpticalLed tone={collisionTone} size={22} pulse={collisions === 0} label={collisions === 0 ? 'No collisions' : 'Collision detected'} />
          <span style={{ ...bigNumber, color: toneColor[collisionTone], fontSize: 40 }} aria-live="polite">
            {collisions}
          </span>
        </div>
      </Tile>

      <Tile
        icon={<Ruler size={15} />}
        label="Min separation"
        tone={sepTone}
        footer={
          <RecessedWell height={9}>
            <div
              style={{
                width: `${sepFill}%`,
                height: '100%',
                borderRadius: 999,
                background: toneColor[sepTone],
                transition: 'width .25s ease, background .25s ease',
              }}
            />
          </RecessedWell>
        }
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigNumber, color: sepTone === 'neutral' ? palette.inkFaint : sepTone === 'emerald' ? palette.ink : toneColor[sepTone] }}>
            {minSeparationM === null ? '—' : minSeparationM.toFixed(2)}
          </span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: palette.inkSoft }}>m</span>
        </div>
      </Tile>

      <Tile
        icon={<Users size={15} />}
        label="Active fleet"
        tone={fleetTone}
        footer={<span style={{ fontSize: 11.5, color: palette.inkSoft }}>{totalRobots} registered peers</span>}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={bigNumber}>{activeRobots}</span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: palette.inkSoft }}>/ {totalRobots} online</span>
        </div>
      </Tile>

      <Tile
        icon={<Radio size={15} />}
        label="Mesh packet rate"
        tone="sky"
        footer={<span style={{ fontSize: 11.5, color: palette.inkSoft }}>Heard by observer</span>}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={bigNumber}>{Math.round(packetRateHz)}</span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: palette.inkSoft }}>pkts/s</span>
        </div>
      </Tile>

      <Tile
        icon={<Cpu size={15} />}
        label="Worst-case CPU"
        tone={cpuT}
        footer={
          <span style={{ fontSize: 11.5, color: palette.inkSoft, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Gauge size={12} aria-hidden="true" />
            {worstCpuRobotId ? `${worstCpuRobotId} · Pi-class core` : 'Pi-class core'}
          </span>
        }
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{ ...bigNumber, color: cpuT === 'emerald' ? palette.ink : toneColor[cpuT] }}>
            {worstCpuPct.toFixed(1)}
          </span>
          <span style={{ fontFamily: monoFont, fontSize: 13, color: palette.inkSoft }}>%</span>
        </div>
      </Tile>
    </section>
  );
}

export default SloMetricStrip;
