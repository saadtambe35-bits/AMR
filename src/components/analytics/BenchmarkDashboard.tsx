import { useMemo, useState } from 'react';

/* ---------- deterministic paired-seed simulation ---------- */
const N_SEEDS = 30;
const N_BOOT = 2000;
const REF = {
  b0: { label: 'B0 Stop-and-Wait', makespan: 142, wait: 68, color: '#f59e0b' },
  b1: { label: 'B1 Centralized', makespan: 98, wait: 12, color: '#3e3832' },
  se: { label: 'SwarmEdge v2', makespan: 104, wait: 16, color: '#10b981' },
} as const;
type Key = keyof typeof REF;

function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) =>
  Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const quantile = (sorted: number[], q: number) => {
  const p = (sorted.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (p - lo);
};

function simulate(seedOffset = 0) {
  const rng = mulberry32(20260930 + seedOffset * 101);
  const shared = Array.from({ length: N_SEEDS }, () => gauss(rng) * 7); // same warehouse seed => shared difficulty
  const runs = {} as Record<Key, number[]>;
  (Object.keys(REF) as Key[]).forEach((k) => {
    const raw = shared.map((s) => REF[k].makespan + s * (REF[k].makespan / 120) + gauss(rng) * 3);
    const shift = REF[k].makespan - mean(raw); // pin sample mean to the PRD reference value
    runs[k] = raw.map((x) => x + shift);
  });
  const reductions = runs.b0.map((b, i) => ((b - runs.se[i]) / b) * 100);
  const boot: number[] = [];
  for (let i = 0; i < N_BOOT; i++) {
    let s = 0;
    for (let j = 0; j < N_SEEDS; j++) s += reductions[Math.floor(rng() * N_SEEDS)];
    boot.push(s / N_SEEDS);
  }
  boot.sort((a, b) => a - b);
  return {
    runs,
    reduction: mean(reductions),
    ci: [quantile(boot, 0.025), quantile(boot, 0.975)] as const,
    wins: reductions.filter((r) => r >= 20).length,
  };
}

/* ---------- component ---------- */
export default function BenchmarkDashboard() {
  const [seedOffset, setSeedOffset] = useState(0);
  const sim = useMemo(() => simulate(seedOffset), [seedOffset]);
  const TARGET = 20;
  const pass = sim.ci[0] >= TARGET;

  const W = 640, H = 300, padL = 44, padB = 34, padT = 12;
  const yMin = 70, yMax = 170;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const keys = Object.keys(REF) as Key[];
  const slot = (W - padL - 12) / keys.length;

  return (
    <section className="se-glass" aria-labelledby="bench-h" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
        <h2 id="bench-h" style={{ margin: 0, fontSize: 22, color: '#292524', fontWeight: 800 }}>Makespan benchmark: {N_SEEDS} paired seeds</h2>
        <button
          type="button"
          className="se-btn"
          style={{ padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}
          onClick={() => setSeedOffset((s) => s + 1)}
          title="Run another set of 30 paired Monte Carlo seeds"
        >
          ↺ Resample 30 Seeds {seedOffset > 0 ? `(#${seedOffset + 1})` : ''}
        </button>
      </div>
      <p className="se-muted" style={{ margin: '6px 0 18px', maxWidth: 620, color: '#78716c' }}>
        Each seed runs all three strategies on the same warehouse layout and order stream. The reduction is
        computed per seed against B0, then bootstrapped ({N_BOOT.toLocaleString()} resamples).
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <div style={{ flex: '1 1 380px', minWidth: 0 }}>
          <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: '100%', height: 'auto' }}
               aria-label="Boxplot of makespan in seconds for B0, B1 and SwarmEdge">
            {[80, 100, 120, 140, 160].map((t) => (
              <g key={t}>
                <line x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} stroke="#d7d0c3" opacity={0.6} />
                <text x={padL - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#78716c">{t}s</text>
              </g>
            ))}
            {keys.map((k, i) => {
              const v = [...sim.runs[k]].sort((a, b) => a - b);
              const q1 = quantile(v, 0.25), q2 = quantile(v, 0.5), q3 = quantile(v, 0.75);
              const cx = padL + slot * i + slot / 2, bw = 56;
              return (
                <g key={k}>
                  <line x1={cx} x2={cx} y1={y(v[v.length - 1])} y2={y(v[0])} stroke={REF[k].color} strokeWidth={2} />
                  <rect x={cx - bw / 2} y={y(q3)} width={bw} height={y(q1) - y(q3)} rx={6}
                        fill={REF[k].color} fillOpacity={0.25} stroke={REF[k].color} strokeWidth={2} />
                  <line x1={cx - bw / 2} x2={cx + bw / 2} y1={y(q2)} y2={y(q2)} stroke={REF[k].color} strokeWidth={3} />
                  {v.map((p, j) => (
                    <circle key={j} cx={cx + ((j * 37) % 21) - 10} cy={y(p)} r={2.5} fill={REF[k].color} opacity={0.8} />
                  ))}
                  <text x={cx} y={H - 12} textAnchor="middle" fontSize={12} fontWeight={700} fill="#292524">{REF[k].label}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div style={{ flex: '1 1 260px', display: 'grid', gap: 12, alignContent: 'start' }}>
          <div className="se-inset" style={{ padding: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color: '#292524' }}>{sim.reduction.toFixed(1)}%</div>
            <div className="se-muted" style={{ fontSize: 13, marginTop: 4, color: '#78716c' }}>makespan reduction vs B0</div>
            <div style={{ marginTop: 8, fontSize: 13.5, color: '#292524' }}>
              95% CI: <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{sim.ci[0].toFixed(1)}%</span> to <span style={{ color: '#0ea5e9', fontWeight: 700 }}>{sim.ci[1].toFixed(1)}%</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 13.5, fontWeight: 700, color: pass ? '#059669' : '#dc2626' }}>
              {pass ? `Clears the ${TARGET}% target; whole interval is above it` : `Interval dips below the ${TARGET}% target`}
            </div>
            <div className="se-muted" style={{ marginTop: 4, fontSize: 12.5, color: '#78716c' }}>{sim.wins}/{N_SEEDS} seeds individually at or above {TARGET}%</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr className="se-muted" style={{ textAlign: 'left', color: '#78716c' }}>
                <th style={{ padding: '6px 0', borderBottom: '1px solid rgba(215,208,195,0.9)' }}>Strategy</th>
                <th style={{ borderBottom: '1px solid rgba(215,208,195,0.9)' }}>Makespan</th>
                <th style={{ borderBottom: '1px solid rgba(215,208,195,0.9)' }}>Total wait</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k} style={{ borderTop: '1px solid rgba(215,208,195,0.6)' }}>
                  <td style={{ padding: '8px 0', color: '#292524', fontWeight: 600 }}>
                    <span aria-hidden style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2.5, background: REF[k].color, marginRight: 8, boxShadow: `0 0 6px ${REF[k].color}` }} />
                    {REF[k].label}
                  </td>
                  <td style={{ color: '#292524', fontWeight: 700 }}>{REF[k].makespan}s</td>
                  <td style={{ color: '#78716c' }}>{REF[k].wait}s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="se-muted" style={{ margin: '16px 0 0', fontSize: 12.5, color: '#78716c' }}>
        Note: means are pinned to the PRD reference values (142 / 98 / 104 s). Per-seed spread is synthetic
        (seeded PRNG, reproducible) until real runner output is wired in; replace <code>simulate()</code> with
        your measured runs to make the interval empirical.
      </p>
    </section>
  );
}
