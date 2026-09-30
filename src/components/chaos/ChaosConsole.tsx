import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 * SwarmEdge v2 · BLOCK 6a · Chaos Console
 * Judge-operable fault injection deck (PRD §12 / S1).
 *
 * - `useChaosEngine` is the simulation hook. It owns fleet health, fault
 *   timers, telemetry and the event log. Bridge it to your real sim through
 *   `onInject` (every fault is emitted as a typed ChaosEvent).
 * - `ChaosConsole` is the presentational deck. Use it standalone (it runs its
 *   own engine) or pass an `engine` created by the parent to share state.
 * ──────────────────────────────────────────────────────────────────────────── */

export const V_MAX = 1.2; // m/s, nominal AMR top speed
export const BYZANTINE_GATE = 1.5 * V_MAX; // sanity gate rejects anything above this
export const BLACKOUT_MS = 5000;

export type RobotHealth =
  | 'NOMINAL'
  | 'DEAD'
  | 'STALLED'
  | 'SILENT'
  | 'BYZANTINE'
  | 'DISTRUSTED';

export interface ChaosRobot {
  id: number;
  label: string;
  health: RobotHealth;
}

export type ChaosFaultKind =
  | 'KILL_ROBOT'
  | 'STALL_MOTORS'
  | 'WIFI_BLACKOUT'
  | 'PACKET_LOSS'
  | 'BLOCK_AISLE'
  | 'BYZANTINE'
  | 'ADD_ROBOTS'
  | 'RESET';

export interface ChaosEvent {
  kind: ChaosFaultKind;
  /** true = fault applied, false = fault cleared */
  active: boolean;
  targetId?: number;
  /** packet-loss percent, blackout ms, new fleet size … */
  value?: number;
  edge?: string;
  at: number;
}

export interface LogLine {
  id: number;
  t: string;
  level: 'INFO' | 'WARN' | 'FAULT' | 'OK';
  text: string;
}

const makeRobots = (n: number, from = 0): ChaosRobot[] =>
  Array.from({ length: n }, (_, i) => ({
    id: from + i,
    label: `R${from + i + 1}`,
    health: 'NOMINAL' as RobotHealth,
  }));

/* ─────────────────────────── simulation hook ─────────────────────────── */

export interface ChaosEngineOptions {
  initialFleet?: number;
  blockedEdgeId?: string;
  onInject?: (event: ChaosEvent) => void;
}

export function useChaosEngine(opts: ChaosEngineOptions = {}) {
  const { initialFleet = 3, blockedEdgeId = 'E12', onInject } = opts;

  const [robots, setRobots] = useState<ChaosRobot[]>(() => makeRobots(initialFleet));
  const [targetId, setTargetId] = useState(0);
  const [packetLoss, setPacketLossState] = useState(0);
  const [blackoutMs, setBlackoutMs] = useState(0);
  const [blockedEdge, setBlockedEdge] = useState<string | null>(null);
  const [byz, setByz] = useState<{ id: number; v: number; rejected: number } | null>(null);
  const [distrust, setDistrust] = useState<number[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);

  const robotsRef = useRef(robots);
  robotsRef.current = robots;
  const targetRef = useRef(targetId);
  targetRef.current = targetId;
  const onInjectRef = useRef(onInject);
  onInjectRef.current = onInject;

  const startedAt = useRef(Date.now());
  const logId = useRef(0);
  const taskSeq = useRef(40);
  const timeouts = useRef<number[]>([]);
  const blackoutIv = useRef<number | null>(null);
  const byzIv = useRef<number | null>(null);
  const lastLoggedLoss = useRef(0);

  const say = useCallback((level: LogLine['level'], text: string) => {
    const s = ((Date.now() - startedAt.current) / 1000).toFixed(1).padStart(6, '0');
    setLog((prev) => [{ id: logId.current++, t: `T+${s}`, level, text }, ...prev].slice(0, 60));
  }, []);

  const later = useCallback((ms: number, fn: () => void) => {
    timeouts.current.push(window.setTimeout(fn, ms));
  }, []);

  const emit = useCallback((e: Omit<ChaosEvent, 'at'>) => {
    onInjectRef.current?.({ ...e, at: Date.now() });
  }, []);

  const setHealth = useCallback((id: number, health: RobotHealth) => {
    setRobots((prev) => prev.map((r) => (r.id === id ? { ...r, health } : r)));
  }, []);

  const clearAllTimers = useCallback(() => {
    timeouts.current.forEach((t) => window.clearTimeout(t));
    timeouts.current = [];
    if (blackoutIv.current !== null) window.clearInterval(blackoutIv.current);
    if (byzIv.current !== null) window.clearInterval(byzIv.current);
    blackoutIv.current = null;
    byzIv.current = null;
  }, []);

  useEffect(() => () => clearAllTimers(), [clearAllTimers]);

  const label = (id: number) => `R${id + 1}`;
  const healthOf = (id: number) => robotsRef.current.find((r) => r.id === id)?.health;
  const firstPeer = (excluding: number) =>
    robotsRef.current.find((r) => r.id !== excluding && r.health === 'NOMINAL');

  /* [Kill Robot Process] */
  const killRobot = useCallback(() => {
    const id = targetRef.current;
    if (healthOf(id) === 'DEAD') {
      say('WARN', `${label(id)} is already dead. Pick another target.`);
      return;
    }
    emit({ kind: 'KILL_ROBOT', active: true, targetId: id });
    setHealth(id, 'DEAD');
    say('FAULT', `SIGKILL → ${label(id)}. Process gone, state beats stopped.`);
    later(300, () =>
      say('WARN', `Peers missed 3 beats from ${label(id)}. Bounds inflated to worst-case radius.`),
    );
    later(700, () => {
      const winner = firstPeer(id);
      const task = `T-${taskSeq.current++}`;
      say(
        winner ? 'OK' : 'WARN',
        winner
          ? `${task} re-auctioned. ${winner.label} won the bid in 412 ms. 0 collisions.`
          : `${task} has no bidders. Fleet has no healthy peer.`,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, later, say, setHealth]);

  /* [Stall Motors] (toggle) */
  const stallMotors = useCallback(() => {
    const id = targetRef.current;
    const h = healthOf(id);
    if (h === 'STALLED') {
      emit({ kind: 'STALL_MOTORS', active: false, targetId: id });
      setHealth(id, 'NOMINAL');
      say('OK', `${label(id)} motors released. Progress resumed.`);
      return;
    }
    if (h !== 'NOMINAL') {
      say('WARN', `${label(id)} is ${h?.toLowerCase()}. Stall needs a nominal robot.`);
      return;
    }
    emit({ kind: 'STALL_MOTORS', active: true, targetId: id });
    setHealth(id, 'STALLED');
    say('FAULT', `${label(id)} motors stalled. Heartbeat OK, velocity 0.00 m/s.`);
    later(2000, () => {
      if (healthOf(id) === 'STALLED')
        say('WARN', `Progress watchdog: ${label(id)} treated as static obstacle. Task re-auctioned.`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, later, say, setHealth]);

  /* [5s Wi-Fi Blackout] */
  const wifiBlackout = useCallback(() => {
    const id = targetRef.current;
    if (blackoutIv.current !== null) return;
    if (healthOf(id) !== 'NOMINAL') {
      say('WARN', `${label(id)} is ${healthOf(id)?.toLowerCase()}. Blackout needs a nominal robot.`);
      return;
    }
    emit({ kind: 'WIFI_BLACKOUT', active: true, targetId: id, value: BLACKOUT_MS });
    setHealth(id, 'SILENT');
    setBlackoutMs(BLACKOUT_MS);
    say('FAULT', `Zenoh session on ${label(id)} cut for 5 s. Peers see a silent neighbor.`);
    later(200, () =>
      say('WARN', `Silent-peer inflation on ${label(id)}. Neighbors slow to conservative speed.`),
    );
    const start = Date.now();
    blackoutIv.current = window.setInterval(() => {
      const left = Math.max(0, BLACKOUT_MS - (Date.now() - start));
      setBlackoutMs(left);
      if (left === 0) {
        if (blackoutIv.current !== null) window.clearInterval(blackoutIv.current);
        blackoutIv.current = null;
        setRobots((prev) =>
          prev.map((r) => (r.id === id && r.health === 'SILENT' ? { ...r, health: 'NOMINAL' } : r)),
        );
        emit({ kind: 'WIFI_BLACKOUT', active: false, targetId: id });
        say('OK', `Mesh restored. ${label(id)} rejoined, leases revalidated. 0 collisions.`);
      }
    }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, later, say, setHealth]);

  /* [30% Packet Loss] slider */
  const setPacketLoss = useCallback(
    (pct: number) => {
      const v = Math.max(0, Math.min(60, Math.round(pct)));
      setPacketLossState(v);
      emit({ kind: 'PACKET_LOSS', active: v > 0, value: v });
      if (Math.abs(v - lastLoggedLoss.current) >= 10 || (v === 0) !== (lastLoggedLoss.current === 0)) {
        lastLoggedLoss.current = v;
        say(
          v === 0 ? 'OK' : 'FAULT',
          v === 0
            ? 'Packet loss cleared. Beat delivery back to 100%.'
            : `Dropping ${v}% of state beats at random. Throughput degrades, safety holds.`,
        );
      }
    },
    [emit, say],
  );

  /* [Block Aisle] (toggle) */
  const blockAisle = useCallback(() => {
    if (blockedEdge) {
      emit({ kind: 'BLOCK_AISLE', active: false, edge: blockedEdge });
      say('OK', `Obstacle cleared from ${blockedEdge}. Fleet gossips edge back to open.`);
      setBlockedEdge(null);
      return;
    }
    emit({ kind: 'BLOCK_AISLE', active: true, edge: blockedEdgeId });
    setBlockedEdge(blockedEdgeId);
    say('FAULT', `Obstacle dropped into aisle ${blockedEdgeId}.`);
    later(400, () =>
      say('OK', `Nearest robot detected ${blockedEdgeId} blocked. Re-route gossiped to all peers.`),
    );
  }, [blockedEdge, blockedEdgeId, emit, later, say]);

  /* [Byzantine Telemetry] (toggle) */
  const byzantine = useCallback(() => {
    const id = targetRef.current;
    if (byzIv.current !== null) {
      window.clearInterval(byzIv.current);
      byzIv.current = null;
      setByz(null);
      setRobots((prev) =>
        prev.map((r) => (r.id === id && r.health === 'BYZANTINE' ? { ...r, health: 'NOMINAL' } : r)),
      );
      emit({ kind: 'BYZANTINE', active: false, targetId: id });
      say('OK', `${label(id)} telemetry back in range.`);
      return;
    }
    if (healthOf(id) !== 'NOMINAL') {
      say('WARN', `${label(id)} is ${healthOf(id)?.toLowerCase()}. Byzantine mode needs a nominal robot.`);
      return;
    }
    emit({ kind: 'BYZANTINE', active: true, targetId: id });
    setHealth(id, 'BYZANTINE');
    setByz({ id, v: V_MAX * 1.7, rejected: 0 });
    say('FAULT', `${label(id)} broadcasting impossible velocity jumps (> 1.5 × v_max).`);
    let rejected = 0;
    byzIv.current = window.setInterval(() => {
      rejected += 1;
      const v = V_MAX * (1.6 + Math.random() * 1.4);
      setByz({ id, v, rejected });
      if (rejected === 1)
        say('WARN', `Sanity gate rejected ${label(id)}: ${v.toFixed(2)} m/s exceeds ${BYZANTINE_GATE.toFixed(2)}.`);
      if (rejected === 3) {
        setDistrust((d) => (d.includes(id) ? d : [...d, id]));
        setHealth(id, 'DISTRUSTED');
        say('OK', `${label(id)} added to distrust list after 3 strikes. Peers ignore its beats.`);
      }
    }, 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emit, say, setHealth]);

  /* [Add Robots to Fleet] */
  const addRobots = useCallback(
    (size: number) => {
      const current = robotsRef.current.length;
      if (size <= current) return;
      emit({ kind: 'ADD_ROBOTS', active: true, value: size });
      setRobots((prev) => [...prev, ...makeRobots(size - prev.length, prev.length)]);
      say(
        'OK',
        `Fleet scaled ${current} → ${size}. New peers joined by multicast scouting, no registry needed.`,
      );
    },
    [emit, say],
  );

  const reset = useCallback(() => {
    clearAllTimers();
    const n = robotsRef.current.length;
    setRobots(makeRobots(n));
    setPacketLossState(0);
    lastLoggedLoss.current = 0;
    setBlackoutMs(0);
    setBlockedEdge(null);
    setByz(null);
    setDistrust([]);
    emit({ kind: 'RESET', active: false });
    say('INFO', 'All faults cleared. Fleet re-armed.');
  }, [clearAllTimers, emit, say]);

  /* derived telemetry */
  const telemetry = useMemo(() => {
    const total = robots.length;
    const weight = (h: RobotHealth) =>
      h === 'NOMINAL' ? 1 : h === 'SILENT' ? 0.5 : h === 'BYZANTINE' ? 0.7 : 0;
    const effective = robots.reduce((s, r) => s + weight(r.health), 0);
    let pct = (effective / Math.max(1, total)) * 100;
    pct *= 1 - 0.4 * (packetLoss / 100);
    if (blackoutMs > 0) pct *= 0.9;
    if (blockedEdge) pct *= 0.92;
    const degraded = robots.filter((r) => r.health !== 'NOMINAL').length;
    return {
      throughputPct: Math.max(0, Math.min(100, Math.round(pct))),
      inflatedPeers: degraded,
      silentPeers: robots.filter((r) => r.health === 'SILENT' || r.health === 'DEAD').length,
    };
  }, [robots, packetLoss, blackoutMs, blockedEdge]);

  return {
    robots,
    fleetSize: robots.length,
    targetId,
    setTargetId,
    packetLoss,
    blackoutMs,
    blockedEdge,
    byz,
    distrust,
    log,
    telemetry,
    actions: { killRobot, stallMotors, wifiBlackout, setPacketLoss, blockAisle, byzantine, addRobots, reset },
  };
}

export type ChaosEngine = ReturnType<typeof useChaosEngine>;

/* ───────────────────────────── presentation ───────────────────────────── */

export interface ChaosConsoleProps {
  /** Share an engine created by the parent. Omit to let the console own one. */
  engine?: ChaosEngine;
  initialFleet?: number;
  onInject?: (event: ChaosEvent) => void;
  /** Real collision count from the sim. Defaults to 0 (L0 Safety Kernel). */
  collisions?: number;
  className?: string;
}

const HEALTH_COLOR: Record<RobotHealth, string> = {
  NOMINAL: '#10b981',
  DEAD: '#ef4444',
  STALLED: '#f59e0b',
  SILENT: '#38bdf8',
  BYZANTINE: '#c084fc',
  DISTRUSTED: '#64748b',
};

function Lever({
  on,
  onToggle,
  label,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`cc-lever ${on ? 'is-on' : ''}`}
      onClick={onToggle}
    >
      <span className="cc-lever-slot" />
      <span className="cc-lever-arm" />
    </button>
  );
}

function Module({
  title,
  hint,
  lit,
  badge,
  children,
}: {
  title: string;
  hint: string;
  lit: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className={`cc-mod ${lit ? 'is-lit' : ''}`}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span className="cc-led" aria-hidden="true" />
          <h3>{title}</h3>
        </div>
        {badge}
      </header>
      <p className="cc-hint">{hint}</p>
      <div className="cc-mod-body">{children}</div>
    </section>
  );
}

export default function ChaosConsole(props: ChaosConsoleProps) {
  const { initialFleet = 3, onInject, collisions = 0, className } = props;
  const own = useChaosEngine({ initialFleet, onInject });
  const e = props.engine ?? own;
  const { actions } = e;
  const target = e.robots.find((r) => r.id === e.targetId) ?? e.robots[0];
  const targetLabel = target ? target.label : 'R1';

  const stalled = target?.health === 'STALLED';
  const byzOn = e.byz !== null;
  const blackoutOn = e.blackoutMs > 0;

  return (
    <div className={`cc-root ${className ?? ''}`}>
      <style>{CSS}</style>

      <div className="cc-top">
        <div>
          <h2>Chaos Console</h2>
          <p>Break the fleet on purpose. Every fault below is live.</p>
        </div>
        <div className="cc-top-right">
          <span className="cc-chip"><b>{e.fleetSize}</b> robots</span>
          <span className="cc-chip"><b>{collisions}</b> collisions</span>
          <button type="button" className="shiny-dark-button" style={{ padding: '6px 14px', fontSize: '11.5px' }} onClick={actions.reset}>
            Clear all faults
          </button>
        </div>
      </div>

      <div className="cc-targets" role="radiogroup" aria-label="Target robot">
        <span className="cc-targets-label">Target</span>
        <div className="cc-targets-grid">
          {e.robots.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === e.targetId}
              className={`cc-tchip ${r.id === e.targetId ? 'is-sel' : ''}`}
              onClick={() => e.setTargetId(r.id)}
              title={`${r.label} · ${r.health.toLowerCase()}`}
            >
              <i style={{ background: HEALTH_COLOR[r.health] }} />
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="cc-deck">
        <div className="cc-mods">
          <Module
            title="Kill Robot Process"
            hint={`Sends SIGKILL to ${targetLabel}. State beats stop, peers inflate, task is re-auctioned.`}
            lit={target?.health === 'DEAD'}
          >
            <button type="button" className="cc-key cc-key-red" onClick={actions.killRobot}>
              <span>SIGKILL {targetLabel}</span>
            </button>
          </Module>

          <Module
            title="Stall Motors"
            hint={`${targetLabel} stays alive and keeps its heartbeat, but does not move.`}
            lit={stalled}
          >
            <div className="cc-row">
              <Lever on={stalled} onToggle={actions.stallMotors} label={`Stall motors on ${targetLabel}`} />
              <span className="cc-readout">{stalled ? '0.00 m/s · beat OK' : 'released'}</span>
            </div>
          </Module>

          <Module
            title="5s Wi-Fi Blackout"
            hint={`Cuts ${targetLabel} off the Zenoh mesh. Peers slow down and keep every gap.`}
            lit={blackoutOn}
          >
            <button
              type="button"
              className="cc-key cc-key-amber"
              onClick={actions.wifiBlackout}
              disabled={blackoutOn}
            >
              <span>{blackoutOn ? `${(e.blackoutMs / 1000).toFixed(1)} s left` : 'Cut mesh 5 s'}</span>
            </button>
            <div className="cc-bar" aria-hidden="true">
              <i style={{ width: `${(e.blackoutMs / BLACKOUT_MS) * 100}%` }} />
            </div>
          </Module>

          <Module
            title="Packet Loss"
            hint="Drops state beats at random. Throughput slides down, safety does not."
            lit={e.packetLoss > 0}
            badge={
              <span
                style={{
                  fontFamily: 'ui-monospace, "JetBrains Mono", monospace',
                  fontWeight: 800,
                  fontSize: '15px',
                  color: e.packetLoss > 0 ? '#ef4444' : '#57534e',
                  background: e.packetLoss > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(0, 0, 0, 0.05)',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  border: `1px solid ${e.packetLoss > 0 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(0, 0, 0, 0.08)'}`,
                  letterSpacing: '-0.02em',
                }}
              >
                {e.packetLoss}%
              </span>
            }
          >
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <input
                className="cc-slider"
                type="range"
                min={0}
                max={60}
                step={5}
                value={e.packetLoss}
                onChange={(ev) => actions.setPacketLoss(Number(ev.target.value))}
                aria-label="Packet loss percent"
                style={{ width: '100%' }}
              />
              <div className="cc-ticks" aria-hidden="true">
                <span>0</span><span>15</span><span>30</span><span>45</span><span>60</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <button
                type="button"
                className="shiny-dark-button"
                style={{ padding: '4px 10px', fontSize: '11px' }}
                onClick={() => actions.setPacketLoss(30)}
              >
                Set 30%
              </button>
              {e.packetLoss > 0 && (
                <button
                  type="button"
                  className="shiny-dark-button"
                  style={{ padding: '4px 10px', fontSize: '11px', opacity: 0.85 }}
                  onClick={() => actions.setPacketLoss(0)}
                >
                  Reset 0%
                </button>
              )}
            </div>
          </Module>

          <Module
            title="Block Aisle"
            hint="Drops an obstacle onto edge E12. The fleet detects it and gossips a re-route."
            lit={e.blockedEdge !== null}
          >
            <div className="cc-row">
              <Lever on={e.blockedEdge !== null} onToggle={actions.blockAisle} label="Block aisle E12" />
              <span className="cc-readout">{e.blockedEdge ? 'E12 blocked' : 'E12 open'}</span>
            </div>
          </Module>

          <Module
            title="Byzantine Telemetry"
            hint={`${targetLabel} broadcasts impossible speeds. The sanity gate rejects them, then distrusts it.`}
            lit={byzOn}
          >
            <div className="cc-row">
              <Lever on={byzOn} onToggle={actions.byzantine} label={`Byzantine telemetry on ${targetLabel}`} />
              <span className="cc-readout">
                {e.byz ? `${e.byz.v.toFixed(2)} m/s · ${e.byz.rejected} rejected` : 'clean'}
              </span>
            </div>
            <div className="cc-gate" aria-hidden="true">
              <i style={{ width: `${Math.min(100, ((e.byz?.v ?? 0) / (V_MAX * 3)) * 100)}%` }} />
              <b style={{ left: `${(BYZANTINE_GATE / (V_MAX * 3)) * 100}%` }} />
            </div>
          </Module>

          <Module
            title="Add Robots to Fleet"
            hint="Scale the fleet on the fly. New peers join with no central registry."
            lit={e.fleetSize > 3}
          >
            <div className="cc-seg">
              {[12, 30].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="shiny-dark-button"
                  style={{ padding: '8px 12px', fontSize: '12px', width: '100%' }}
                  disabled={e.fleetSize >= n}
                  onClick={() => actions.addRobots(n)}
                >
                  <span>{e.fleetSize >= n ? `${n} ✓` : `to ${n}`}</span>
                </button>
              ))}
            </div>
          </Module>
        </div>

        <aside className="cc-side">
          <div className="cc-gauge">
            <div className="cc-gauge-num">{e.telemetry.throughputPct}<small>%</small></div>
            <div className="cc-gauge-track"><i style={{ width: `${e.telemetry.throughputPct}%` }} /></div>
            <p>fleet throughput</p>
          </div>

          <dl className="cc-stats">
            <div><dt>Collisions</dt><dd className="ok">{collisions}</dd></div>
            <div><dt>Inflated peers</dt><dd>{e.telemetry.inflatedPeers}</dd></div>
            <div><dt>Silent or dead</dt><dd>{e.telemetry.silentPeers}</dd></div>
            <div>
              <dt>Distrust list</dt>
              <dd>{e.distrust.length ? e.distrust.map((id) => `R${id + 1}`).join(', ') : 'empty'}</dd>
            </div>
          </dl>

          <div className="cc-log" role="log" aria-live="polite" aria-label="Fault event log">
            {e.log.length === 0 && <p className="cc-empty">No faults yet. Pick a target and hit a control.</p>}
            {e.log.map((l) => (
              <p key={l.id} className={`cc-line lv-${l.level}`}>
                <time>{l.t}</time> {l.text}
              </p>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ───────────────────────────────── styles ───────────────────────────────── */

const CSS = `
.cc-root{--ink:#2b2621;--dim:#6e675f;--steel:#e3ded2;--steel2:#ece7dc;--edge:rgba(215,208,195,0.9);--red:#ef4444;--amber:#f59e0b;--green:#10b981;--cyan:#0ea5e9;
  font-family:"Inter",system-ui,sans-serif;color:var(--ink);
  background:linear-gradient(135deg, rgba(255, 255, 255, 0.72) 0%, rgba(255, 255, 255, 0.38) 100%) !important;
  backdrop-filter:blur(24px) saturate(170%) !important;-webkit-backdrop-filter:blur(24px) saturate(170%) !important;
  border-radius:20px !important;border:1px solid rgba(255, 255, 255, 0.85) !important;
  border-bottom-color:rgba(255, 255, 255, 0.4) !important;border-right-color:rgba(255, 255, 255, 0.5) !important;
  box-shadow:0 20px 35px -10px rgba(125, 110, 90, 0.16), 0 4px 12px -2px rgba(125, 110, 90, 0.08), inset 0 1px 2px 0 rgba(255, 255, 255, 1), inset 0 -1px 2px 0 rgba(160, 145, 125, 0.12) !important;
  padding:22px;position:relative;}
.cc-root::before{content:'';position:absolute;top:0;left:0;right:0;height:1.5px;pointer-events:none;z-index:2;
  background:linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.4) 15%,rgba(255,255,255,1) 50%,rgba(255,255,255,0.4) 85%,transparent 100%);}
.cc-root *{box-sizing:border-box}
.cc-top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
.cc-top h2{margin:0;font-size:24px;letter-spacing:-.02em;font-weight:800;color:#2b2621}
.cc-top p{margin:4px 0 0;color:var(--dim);font-size:13px;font-weight:600}
.cc-top-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-chip{background:linear-gradient(155deg, #251e18 0%, #130f0c 100%) !important;border:1px solid rgba(215,180,145,0.35) !important;border-radius:8px !important;padding:4px 10px;font:700 11px ui-monospace,"JetBrains Mono",monospace;color:#f3ede2 !important;box-shadow:0 4px 10px rgba(0,0,0,0.22), inset 0 1px 1px rgba(255,255,255,0.16) !important;}
.cc-chip b{color:#ffffff;font-weight:700}
.cc-reset{background:linear-gradient(145deg, #ffffff 0%, #ebe5d8 100%) !important;color:#2b2621 !important;border:1px solid rgba(255,255,255,0.9) !important;border-bottom-color:rgba(160, 145, 125, 0.3) !important;border-radius:12px;padding:6px 14px;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;box-shadow:3px 4px 10px rgba(140, 125, 105, 0.16), -2px -2px 6px rgba(255, 255, 255, 0.95), inset 0 1px 1px rgba(255, 255, 255, 0.8) !important;transition:all .15s ease}
.cc-reset:hover{transform:translateY(-1px)}
.cc-reset:active{transform:translateY(1px);box-shadow:inset 2px 2px 5px rgba(130, 115, 95, 0.25), inset -1px -1px 3px rgba(255, 255, 255, 0.8) !important}
.cc-root button:focus-visible,.cc-root input:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}

.cc-targets{display:flex;gap:12px;align-items:flex-start;background:#e3ded2 !important;border:1px solid rgba(255,255,255,0.5) !important;border-top-color:rgba(140, 125, 105, 0.3) !important;border-left-color:rgba(140, 125, 105, 0.24) !important;border-radius:12px;padding:10px 14px;margin-bottom:16px;box-shadow:inset 3px 3px 6px rgba(130, 115, 95, 0.22), inset -2px -2px 5px rgba(255, 255, 255, 0.95), 0 1px 2px rgba(255, 255, 255, 0.75) !important;}
.cc-targets-label{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);padding-top:6px}
.cc-targets-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:112px;overflow:auto;flex:1}
.cc-tchip{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(145deg, #ffffff 0%, #ebe5d8 100%);color:#2b2621;border:1px solid rgba(255,255,255,0.9);border-radius:8px;padding:5px 11px;font:700 12px ui-monospace,"JetBrains Mono",monospace;cursor:pointer;transition:all 0.15s ease;box-shadow:2px 2px 5px rgba(140,125,105,0.12), -1px -1px 3px rgba(255,255,255,0.9)}
.cc-tchip i{width:8px;height:8px;border-radius:50%;box-shadow:0 0 8px currentColor}
.cc-tchip:hover{transform:translateY(-1px)}
.cc-tchip.is-sel{border-color:rgba(215, 180, 145, 0.4);background:linear-gradient(155deg, #251e18 0%, #130f0c 100%) !important;color:#f3ede2 !important;box-shadow:0 4px 10px rgba(0,0,0,0.22), inset 0 1px 1px rgba(255,255,255,0.16) !important;}

.cc-deck{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}
@media(max-width:980px){.cc-deck{grid-template-columns:1fr}}
.cc-mods{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;align-content:start}
.cc-mod{background:linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.72) 100%);border:1px solid rgba(255,255,255,0.98);border-radius:14px;padding:15px;box-shadow:0 4px 14px rgba(150, 135, 115, 0.12), inset 0 1px 1px #fff;display:flex;flex-direction:column;gap:8px;transition:all 0.2s cubic-bezier(0.2,0.8,0.2,1)}
.cc-mod:hover{transform:translateY(-2px);box-shadow:0 8px 24px rgba(150, 135, 115, 0.16), inset 0 1px 1px #fff}
.cc-mod header{display:flex;align-items:center;gap:9px}
.cc-mod h3{margin:0;font-size:14.5px;font-weight:800;color:#231f1c}
.cc-hint{margin:0;color:var(--dim);font-size:12px;line-height:1.45;min-height:35px;font-weight:500}
.cc-mod-body{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.cc-led{width:9px;height:9px;border-radius:50%;background:#e5e7eb;box-shadow:inset 0 1px 1px rgba(0,0,0,.2)}
.cc-mod.is-lit .cc-led{background:var(--red);box-shadow:0 0 10px var(--red)}
.cc-mod.is-lit{border-color:rgba(239,68,68,0.4);background:linear-gradient(135deg, rgba(254, 242, 242, 0.95) 0%, rgba(254, 226, 226, 0.75) 100%)}

.cc-row{display:flex;align-items:center;gap:12px}
.cc-readout{font:700 12px ui-monospace,"JetBrains Mono",monospace;color:var(--dim)}
.cc-big{font:800 22px ui-monospace,"JetBrains Mono",monospace;color:#231f1c;min-width:56px;text-align:right}

.cc-key{position:relative;border:0;border-radius:12px;padding:0;height:44px;cursor:pointer;font:800 13.5px "Inter",system-ui,sans-serif;
  box-shadow:0 4px 14px rgba(140,125,105,0.12), inset 0 1px 1px rgba(255,255,255,0.3);transition:all .08s ease;background:var(--bg);width:100%}
.cc-key span{display:block;padding:0 12px}
.cc-key:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.05)}
.cc-key:active:not(:disabled){transform:translateY(2px);box-shadow:inset 0 2px 4px rgba(0,0,0,0.3)}
.cc-key:disabled{filter:saturate(.3) brightness(.7);cursor:not-allowed}
.cc-key-red{--bg:radial-gradient(circle at 35% 25%, #ff5258 0%, #e11d48 55%, #9f1239 100%);border:1px solid #881337;color:#ffffff;box-shadow:0 5px 0 #700c28, 0 10px 20px rgba(225,29,72,0.35), inset 0 2px 0 rgba(255,255,255,0.45)}
.cc-key-red:active:not(:disabled){transform:translateY(2px);box-shadow:0 2px 0 #700c28, 0 4px 8px rgba(112,12,40,0.4), inset 0 2px 0 rgba(255,255,255,0.45)}
.cc-key-amber{--bg:radial-gradient(circle at 35% 25%, #f59e0b 0%, #d97706 55%, #92400e 100%);border:1px solid #78350f;color:#ffffff;box-shadow:0 4px 0 #78350f, 0 10px 20px rgba(245,158,11,0.35), inset 0 2px 0 rgba(255,255,255,0.45)}
.cc-key-amber:active:not(:disabled){transform:translateY(2px);box-shadow:0 2px 0 #78350f, 0 4px 8px rgba(120,53,15,0.4), inset 0 2px 0 rgba(255,255,255,0.45)}
.cc-key-slate{--bg:linear-gradient(145deg, #faf8f2, #ede9df);border:1px solid rgba(255,255,255,0.7);color:#231f1c;box-shadow:3px 3px 7px rgba(160,148,130,0.16), -2px -2px 6px rgba(255,255,255,0.9)}
.cc-seg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cc-mini{align-self:flex-start;background:linear-gradient(145deg, #faf8f2, #ede9df);color:#44403c;border:1px solid rgba(255,255,255,0.7);border-radius:8px;padding:4px 10px;font:700 12px ui-monospace,"JetBrains Mono",monospace;cursor:pointer;box-shadow:2px 2px 5px rgba(160,148,130,0.14), -2px -2px 4px rgba(255,255,255,0.85);transition:all 0.15s ease}
.cc-mini:hover{background:#ffffff;border-color:rgba(185,175,160,0.9)}

.cc-lever{position:relative;width:64px;height:34px;border-radius:8px;border:1px solid rgba(255,255,255,0.6);border-top-color:rgba(160,148,130,0.28);border-left-color:rgba(160,148,130,0.22);background:#eae5d9;cursor:pointer;padding:0;box-shadow:inset 3px 3px 6px rgba(150,138,120,0.25), inset -2px -2px 5px rgba(255,255,255,0.92)}
.cc-lever-slot{position:absolute;inset:6px 8px;border-radius:4px;background:#dfdacd}
.cc-lever-arm{position:absolute;top:3px;left:4px;width:30px;height:26px;border-radius:6px;background:linear-gradient(180deg,#ffffff,#ede9df);border:1px solid rgba(215,208,195,0.95);box-shadow:0 2px 5px rgba(140,125,105,0.25);transition:left .12s cubic-bezier(.3,1.4,.5,1)}
.cc-lever.is-on .cc-lever-arm{left:28px;background:linear-gradient(180deg,#f43f5e,#be123c);border-color:#9f1239;box-shadow:0 2px 6px rgba(244,63,94,0.4)}

.cc-slider{-webkit-appearance:none;appearance:none;flex:1;height:8px;border-radius:4px;background:#eae5d9;box-shadow:inset 2px 2px 4px rgba(150,138,120,0.28), inset -1px -1px 2px rgba(255,255,255,0.85);border:1px solid rgba(215,208,195,0.9);outline-offset:6px}
.cc-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:28px;border-radius:5px;background:linear-gradient(180deg,#ffffff,#d9d3c5);border:1px solid #b8ae9f;box-shadow:0 3px 7px rgba(140,125,105,0.35);cursor:grab}
.cc-slider::-moz-range-thumb{width:22px;height:28px;border-radius:5px;background:linear-gradient(180deg,#ffffff,#d9d3c5);border:1px solid #b8ae9f;box-shadow:0 3px 7px rgba(140,125,105,0.35);cursor:grab}
.cc-ticks{display:flex;justify-content:space-between;font:700 10px ui-monospace,"JetBrains Mono",monospace;color:var(--dim);margin-top:-2px}

.cc-bar,.cc-gate{position:relative;height:7px;border-radius:999px;background:#eae5d9;border:1px solid rgba(215,208,195,0.9);box-shadow:inset 1px 1px 3px rgba(150,138,120,0.25);overflow:hidden}
.cc-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--amber),#f59e0b);box-shadow:0 0 8px rgba(245,158,11,0.5);border-radius:999px;transition:width .1s linear}
.cc-gate{overflow:visible;height:8px}
.cc-gate i{display:block;height:100%;border-radius:4px;background:#c084fc;transition:width .2s}
.cc-gate b{position:absolute;top:-4px;width:2px;height:16px;background:var(--red)}

.cc-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.cc-gauge{background:#eae5d9;border:1px solid rgba(255,255,255,0.6);border-top-color:rgba(160,148,130,0.28);border-left-color:rgba(160,148,130,0.22);border-radius:14px;padding:16px;box-shadow:inset 3px 3px 6px rgba(150,138,120,0.25), inset -2px -2px 5px rgba(255,255,255,0.92), 0 1px 2px rgba(255,255,255,0.8)}
.cc-gauge-num{font:800 46px ui-monospace,"JetBrains Mono",monospace;line-height:1;color:#231f1c;font-variant-numeric:tabular-nums}
.cc-gauge-num small{font-size:20px;color:var(--dim);margin-left:2px}
.cc-gauge-track{height:8px;border-radius:4px;background:#dfdacd;margin:10px 0 6px;overflow:hidden;border:1px solid rgba(215,208,195,0.8);box-shadow:inset 1px 1px 2px rgba(150,138,120,0.2)}
.cc-gauge-track i{display:block;height:100%;background:linear-gradient(90deg,#f59e0b,#10b981);box-shadow:0 0 10px rgba(16,185,129,0.5);border-radius:4px;transition:width .4s}
.cc-gauge p{margin:0;font-size:12px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:0.04em}
.cc-stats{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cc-stats div{background:#eae5d9;border:1px solid rgba(255,255,255,0.6);border-top-color:rgba(160,148,130,0.28);border-left-color:rgba(160,148,130,0.22);border-radius:10px;padding:9px 11px;min-width:0;box-shadow:inset 2px 2px 4px rgba(150,138,120,0.2), inset -1px -1px 3px rgba(255,255,255,0.85)}
.cc-stats dt{font-size:11.5px;color:var(--dim);font-weight:700}
.cc-stats dd{margin:3px 0 0;font:800 15px ui-monospace,"JetBrains Mono",monospace;color:#231f1c;overflow-wrap:anywhere}
.cc-stats dd.ok{color:#059669}
.cc-log{background:linear-gradient(160deg, #1c1815, #120f0d);border:1px solid rgba(217,180,150,0.35);border-radius:12px;padding:12px;height:230px;overflow:auto;font:11.5px/1.45 ui-monospace,"JetBrains Mono",monospace;box-shadow:inset 0 2px 6px rgba(0,0,0,0.5)}
.cc-line{margin:0 0 5px}
.cc-line time{color:#a8a29e}
.lv-FAULT{color:#fb7185}.lv-WARN{color:#f59e0b}.lv-OK{color:#34d399}.lv-INFO{color:#38bdf8}
.cc-empty{margin:0;color:#a8a29e}
@media(prefers-reduced-motion:reduce){.cc-root *{transition:none!important}}
`;
