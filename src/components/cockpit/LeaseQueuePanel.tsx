import { useMemo } from 'react';
import { Crown, Hourglass, Lock, Sigma } from 'lucide-react';
import type { BidBreakdown, IntersectionLease, LeaseClaim } from './types';
import { BID_WEIGHTS, computeBid } from './types';
import {
  CockpitChip,
  CockpitStyles,
  RecessedWell,
  SkinGlassCard,
  monoFont,
  palette,
} from './cockpitKit';

export interface LeaseQueuePanelProps {
  leases: IntersectionLease[];
  onSelectRobot?: (robotId: string) => void;
}

interface Row {
  claim: LeaseClaim;
  breakdown: BidBreakdown;
  rank: number;
}

const SEGMENT_COLORS = { urgency: palette.rose, ke: palette.amber, age: palette.sky } as const;

function buildRows(lease: IntersectionLease): Row[] {
  const rows: Row[] = [];
  if (lease.holder) {
    rows.push({ claim: lease.holder, breakdown: computeBid(lease.holder.bid), rank: 0 });
  }
  const queued = lease.queue
    .map((claim) => ({ claim, breakdown: computeBid(claim.bid) }))
    .sort((a, b) => b.breakdown.total - a.breakdown.total)
    .map((r, i) => ({ ...r, rank: i + 1 }));
  return [...rows, ...queued];
}

function BidEquation({ claim, breakdown }: { claim: LeaseClaim; breakdown: BidBreakdown }) {
  const { urgency, ke, waitAgeS } = claim.bid;
  return (
    <code style={{ fontFamily: monoFont, fontSize: 12, whiteSpace: 'nowrap', color: palette.ink }}>
      Bid = {BID_WEIGHTS.urgency.toFixed(1)}*({urgency.toFixed(2)}) + {BID_WEIGHTS.ke.toFixed(1)}*({ke.toFixed(2)}) +{' '}
      {BID_WEIGHTS.age.toFixed(1)}*({waitAgeS.toFixed(1)}) ={' '}
      <strong style={{ fontSize: 13 }}>{breakdown.total.toFixed(2)}</strong>
    </code>
  );
}

function ContributionBar({ breakdown }: { breakdown: BidBreakdown }) {
  const total = breakdown.total > 0 ? breakdown.total : 1;
  const seg = (v: number) => `${(Math.max(0, v) / total) * 100}%`;
  return (
    <RecessedWell height={8} style={{ minWidth: 90 }}>
      <div style={{ display: 'flex', height: '100%' }} role="img" aria-label="Bid contribution: urgency, kinetic energy, wait age">
        <div style={{ width: seg(breakdown.urgency), background: SEGMENT_COLORS.urgency }} />
        <div style={{ width: seg(breakdown.ke), background: SEGMENT_COLORS.ke }} />
        <div style={{ width: seg(breakdown.age), background: SEGMENT_COLORS.age }} />
      </div>
    </RecessedWell>
  );
}

export function LeaseQueuePanel({ leases, onSelectRobot }: LeaseQueuePanelProps) {
  const tables = useMemo(() => leases.map((lease) => ({ lease, rows: buildRows(lease) })), [leases]);

  return (
    <section aria-label="Intersection lease queue">
      <CockpitStyles />
      <SkinGlassCard padding={16}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, color: palette.ink }}>
            <Lock size={16} aria-hidden="true" /> Intersection leases
          </h2>
          <CockpitChip>
            <Sigma size={12} aria-hidden="true" /> Bid = {BID_WEIGHTS.urgency.toFixed(1)}*(U) + {BID_WEIGHTS.ke.toFixed(1)}*(KE) + {BID_WEIGHTS.age.toFixed(1)}*(Age)
          </CockpitChip>
        </div>

        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11.5, color: palette.inkSoft, flexWrap: 'wrap' }}>
          {(
            [
              ['Urgency', SEGMENT_COLORS.urgency],
              ['Kinetic energy', SEGMENT_COLORS.ke],
              ['Wait age (s)', SEGMENT_COLORS.age],
            ] as const
          ).map(([label, color]) => (
            <span key={label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: color }} />
              {label}
            </span>
          ))}
        </div>

        {tables.length === 0 ? (
          <p style={{ margin: '14px 0 0', color: palette.inkSoft, fontSize: 14 }}>
            No intersection claims right now. Leases appear when a robot approaches a shared node.
          </p>
        ) : null}

        {tables.map(({ lease, rows }) => (
          <div key={lease.nodeId} style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: palette.ink }}>{lease.label}</h3>
              <span style={{ fontFamily: monoFont, fontSize: 11, color: palette.inkFaint }}>{lease.nodeId}</span>
              {lease.ttlMs !== null ? (
                <CockpitChip tone="emerald" title="Lease time to live">
                  <Hourglass size={12} aria-hidden="true" /> TTL {(lease.ttlMs / 1000).toFixed(1)} s
                </CockpitChip>
              ) : (
                <CockpitChip tone="neutral">Free</CockpitChip>
              )}
            </div>

            {rows.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: palette.inkSoft }}>Unclaimed. No holder, no queue.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="se-table">
                  <thead>
                    <tr>
                      <th scope="col">Role</th>
                      <th scope="col">Robot</th>
                      <th scope="col">Urgency</th>
                      <th scope="col">KE</th>
                      <th scope="col">Wait age</th>
                      <th scope="col">Share</th>
                      <th scope="col">Bid breakdown</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(({ claim, breakdown, rank }) => (
                      <tr
                        key={claim.robotId}
                        style={
                          claim.bid.urgency >= 0.8
                            ? {
                                background: 'rgba(245, 158, 11, 0.08)',
                                boxShadow: 'inset 0 0 12px rgba(245, 158, 11, 0.15)',
                              }
                            : undefined
                        }
                      >
                        <td>
                          {claim.role === 'HOLDER' ? (
                            <CockpitChip tone="emerald">
                              <Crown size={12} aria-hidden="true" /> Holder
                            </CockpitChip>
                          ) : (
                            <CockpitChip tone="amber">Queue #{rank}</CockpitChip>
                          )}
                        </td>
                        <td>
                          {onSelectRobot ? (
                            <button
                              type="button"
                              className="se-btn"
                              style={{ padding: '4px 9px', fontFamily: monoFont }}
                              onClick={() => onSelectRobot(claim.robotId)}
                            >
                              {claim.robotId}
                            </button>
                          ) : (
                            <span style={{ fontFamily: monoFont }}>{claim.robotId}</span>
                          )}
                        </td>
                        <td style={{ fontFamily: monoFont }}>{claim.bid.urgency.toFixed(2)}</td>
                        <td style={{ fontFamily: monoFont }}>{claim.bid.ke.toFixed(2)}</td>
                        <td style={{ fontFamily: monoFont }}>{claim.bid.waitAgeS.toFixed(1)} s</td>
                        <td><ContributionBar breakdown={breakdown} /></td>
                        <td><BidEquation claim={claim} breakdown={breakdown} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </SkinGlassCard>
    </section>
  );
}

export default LeaseQueuePanel;
