import { useState } from 'react';

export type AblationId = 'jitter' | 'aging' | 'inflation' | 'ttl' | 'sanity' | 'sharding';

interface Ablation { id: AblationId; name: string; guard: string; failure: string; severity: 'high' | 'critical' }

const ABLATIONS: Ablation[] = [
  { id: 'jitter', name: 'Micro-Jitter', guard: 'Randomized back-off breaks symmetric stand-offs.',
    failure: 'AMRs in narrow aisles enter livelock and oscillate in the hallway.', severity: 'high' },
  { id: 'aging', name: 'Aging Term', guard: 'Waiting time raises a robot\u2019s effective priority.',
    failure: 'Low-priority robots starve at intersections.', severity: 'high' },
  { id: 'inflation', name: 'Silent-Peer Inflation', guard: 'Silent peers get a growing safety radius.',
    failure: 'Near-misses rise during packet blackouts.', severity: 'critical' },
  { id: 'ttl', name: 'Lease TTL', guard: 'Intersection locks expire without a heartbeat.',
    failure: 'A killed robot holds its intersection lock permanently.', severity: 'critical' },
  { id: 'sanity', name: 'Sanity Gate', guard: 'Implausible peer claims are rejected before ranking.',
    failure: 'A byzantine robot corrupts the swarm\u2019s decision ranking.', severity: 'critical' },
  { id: 'sharding', name: 'Zone Sharding', guard: 'Robots only gossip inside their zone.',
    failure: 'Per-robot bandwidth grows quadratically with fleet size N.', severity: 'high' },
];

const allOn = (): Record<AblationId, boolean> =>
  Object.fromEntries(ABLATIONS.map((a) => [a.id, true])) as Record<AblationId, boolean>;

interface Props {
  /** Fires with the full on/off map whenever a switch changes. */
  onChange?: (state: Record<AblationId, boolean>) => void;
}

export default function AblationMatrix({ onChange }: Props) {
  const [on, setOn] = useState(allOn);
  const [fleet, setFleet] = useState(50);

  const update = (next: Record<AblationId, boolean>) => { setOn(next); onChange?.(next); };
  const off = ABLATIONS.filter((a) => !on[a.id]);
  const shardingOff = !on.sharding;
  const msgsPerRobot = shardingOff ? fleet - 1 : Math.min(fleet - 1, 8);

  return (
    <section className="se-glass" aria-labelledby="abl-h" style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <h2 id="abl-h" style={{ margin: 0, fontSize: 22, color: '#292524', fontWeight: 800 }}>Ablation matrix</h2>
        <button className="se-btn" onClick={() => update(allOn())} disabled={off.length === 0}>Restore all safeguards</button>
      </div>
      <p className="se-muted" style={{ margin: '6px 0 16px', color: '#78716c' }}>
        {off.length === 0 ? 'All six safeguards are active.' : `${off.length} of 6 safeguards disabled. Expected failure modes are highlighted.`}
      </p>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {ABLATIONS.map((a) => {
          const active = on[a.id];
          return (
            <div key={a.id} className={active ? 'se-inset' : 'se-inset se-broken'} style={{ padding: 14 }}>
              <label style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', cursor: 'pointer' }}>
                <span style={{ fontWeight: 700, color: '#292524' }}>{a.name}</span>
                <input type="checkbox" role="switch" checked={active} aria-checked={active}
                       onChange={() => update({ ...on, [a.id]: !active })}
                       style={{ width: 18, height: 18, accentColor: '#10b981' }} />
              </label>
              <p className="se-muted" style={{ margin: '6px 0 0', fontSize: 13, color: '#78716c' }}>
                {active ? a.guard : <><strong style={{ color: '#dc2626' }}>{a.severity === 'critical' ? 'Safety failure: ' : 'Liveness failure: '}</strong>{a.failure}</>}
              </p>
            </div>
          );
        })}
      </div>

      <div className="se-inset" style={{ padding: 14, marginTop: 14, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: 13.5, color: '#292524' }}>
          Fleet size N = <strong style={{ color: '#0ea5e9' }}>{fleet}</strong>
          <input type="range" min={10} max={200} step={10} value={fleet} onChange={(e) => setFleet(+e.target.value)}
                 style={{ display: 'block', width: 200, accentColor: '#0ea5e9', marginTop: 4 }} />
        </label>
        <div style={{ fontSize: 13.5, color: '#292524' }}>
          Peers each robot talks to: <strong style={{ color: '#059669' }}>{msgsPerRobot}</strong>
          <span className="se-muted" style={{ color: '#78716c' }}> ({shardingOff ? 'all-to-all, fleet total \u2248 N\u00b2' : 'zone-limited, fleet total \u2248 N'})</span>
        </div>
      </div>
    </section>
  );
}
