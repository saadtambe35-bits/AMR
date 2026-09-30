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
  NOMINAL: '#7fd18b',
  DEAD: '#e5484d',
  STALLED: '#f0a63a',
  SILENT: '#7cc4ff',
  BYZANTINE: '#d68cf0',
  DISTRUSTED: '#8a8f98',
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
  children,
}: {
  title: string;
  hint: string;
  lit: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={`cc-mod ${lit ? 'is-lit' : ''}`}>
      <header>
        <span className="cc-led" aria-hidden="true" />
        <h3>{title}</h3>
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
          <button type="button" className="cc-reset" onClick={actions.reset}>
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
          >
            <div className="cc-row">
              <input
                className="cc-slider"
                type="range"
                min={0}
                max={60}
                step={5}
                value={e.packetLoss}
                onChange={(ev) => actions.setPacketLoss(Number(ev.target.value))}
                aria-label="Packet loss percent"
              />
              <span className="cc-big">{e.packetLoss}%</span>
            </div>
            <div className="cc-ticks" aria-hidden="true">
              <span>0</span><span>15</span><span>30</span><span>45</span><span>60</span>
            </div>
            <button type="button" className="cc-mini" onClick={() => actions.setPacketLoss(30)}>
              Set 30%
            </button>
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
                  className="cc-key cc-key-slate"
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
.cc-root{--ink:#e9e6dc;--dim:#98958b;--steel:#1a1d22;--steel2:#23272e;--edge:#353a43;--red:#e5484d;--amber:#f0a63a;--green:#7fd18b;--cyan:#7cc4ff;
  font-family:"Barlow","Inter",system-ui,sans-serif;color:var(--ink);background:
  repeating-linear-gradient(90deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px),#14161a;
  border:1px solid #0b0c0e;border-radius:18px;padding:22px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 18px 40px rgba(40,34,20,.28);}
.cc-root *{box-sizing:border-box}
.cc-top{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
.cc-top h2{margin:0;font-size:26px;letter-spacing:.02em;font-weight:700}
.cc-top p{margin:4px 0 0;color:var(--dim);font-size:14px}
.cc-top-right{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cc-chip{background:#0d0f12;border:1px solid var(--edge);border-radius:999px;padding:5px 12px;font:12px ui-monospace,"JetBrains Mono",Menlo,monospace;color:var(--dim)}
.cc-chip b{color:var(--ink);font-weight:600}
.cc-reset{background:transparent;color:var(--ink);border:1px solid var(--edge);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
.cc-reset:hover{border-color:var(--dim)}
.cc-root button:focus-visible,.cc-root input:focus-visible{outline:2px solid var(--cyan);outline-offset:2px}

.cc-targets{display:flex;gap:12px;align-items:flex-start;background:#0d0f12;border:1px solid var(--edge);border-radius:12px;padding:10px 12px;margin-bottom:16px}
.cc-targets-label{font-size:13px;color:var(--dim);padding-top:6px}
.cc-targets-grid{display:flex;flex-wrap:wrap;gap:6px;max-height:112px;overflow:auto;flex:1}
.cc-tchip{display:inline-flex;align-items:center;gap:6px;background:var(--steel2);color:var(--ink);border:1px solid var(--edge);border-radius:8px;padding:5px 10px;font:12px ui-monospace,Menlo,monospace;cursor:pointer}
.cc-tchip i{width:8px;height:8px;border-radius:50%;box-shadow:0 0 6px currentColor}
.cc-tchip.is-sel{border-color:var(--cyan);box-shadow:0 0 0 1px var(--cyan) inset;background:#1c2a33}

.cc-deck{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:16px}
@media(max-width:980px){.cc-deck{grid-template-columns:1fr}}
.cc-mods{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;align-content:start}
.cc-mod{background:linear-gradient(180deg,#22262c,#1a1d22);border:1px solid var(--edge);border-radius:12px;padding:14px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 3px 0 #0b0c0e;display:flex;flex-direction:column;gap:8px}
.cc-mod header{display:flex;align-items:center;gap:9px}
.cc-mod h3{margin:0;font-size:15px;font-weight:600}
.cc-hint{margin:0;color:var(--dim);font-size:12.5px;line-height:1.4;min-height:35px}
.cc-mod-body{margin-top:auto;display:flex;flex-direction:column;gap:8px}
.cc-led{width:9px;height:9px;border-radius:50%;background:#3a2426;box-shadow:inset 0 1px 1px rgba(0,0,0,.6)}
.cc-mod.is-lit .cc-led{background:var(--red);box-shadow:0 0 10px var(--red)}
.cc-mod.is-lit{border-color:#5a3436}

.cc-row{display:flex;align-items:center;gap:12px}
.cc-readout{font:12px ui-monospace,Menlo,monospace;color:var(--dim)}
.cc-big{font:600 22px ui-monospace,Menlo,monospace;min-width:56px;text-align:right}

.cc-key{position:relative;border:0;border-radius:10px;padding:0;height:46px;cursor:pointer;font:600 14px "Barlow",system-ui,sans-serif;color:#fff;
  box-shadow:0 5px 0 var(--sh),0 8px 10px rgba(0,0,0,.4);transition:transform .06s,box-shadow .06s;background:var(--bg);width:100%}
.cc-key span{display:block;padding:0 12px}
.cc-key:active:not(:disabled){transform:translateY(4px);box-shadow:0 1px 0 var(--sh),0 2px 4px rgba(0,0,0,.4)}
.cc-key:disabled{filter:saturate(.3) brightness(.7);cursor:not-allowed}
.cc-key-red{--bg:#c93a3f;--sh:#7d1f23}
.cc-key-amber{--bg:#c98a25;--sh:#7a5013;color:#1a1204}
.cc-key-slate{--bg:#3b4350;--sh:#1b2027}
.cc-seg{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.cc-mini{align-self:flex-start;background:#0d0f12;color:var(--ink);border:1px solid var(--edge);border-radius:8px;padding:4px 10px;font:12px ui-monospace,Menlo,monospace;cursor:pointer}

.cc-lever{position:relative;width:64px;height:34px;border-radius:8px;border:1px solid #0b0c0e;background:#0d0f12;cursor:pointer;padding:0;box-shadow:inset 0 2px 5px rgba(0,0,0,.7)}
.cc-lever-slot{position:absolute;inset:6px 8px;border-radius:4px;background:#050607}
.cc-lever-arm{position:absolute;top:3px;left:4px;width:30px;height:26px;border-radius:6px;background:linear-gradient(180deg,#9aa0a9,#5e646d);box-shadow:0 3px 0 #2a2e34,0 4px 6px rgba(0,0,0,.5);transition:left .12s cubic-bezier(.3,1.4,.5,1)}
.cc-lever.is-on .cc-lever-arm{left:28px;background:linear-gradient(180deg,#ff8b8e,#c93a3f);box-shadow:0 3px 0 #6d1a1d,0 0 12px rgba(229,72,77,.6)}

.cc-slider{-webkit-appearance:none;appearance:none;flex:1;height:8px;border-radius:4px;background:#050607;box-shadow:inset 0 1px 3px rgba(0,0,0,.8);outline-offset:6px}
.cc-slider::-webkit-slider-thumb{-webkit-appearance:none;width:22px;height:30px;border-radius:5px;background:linear-gradient(180deg,#b7bcc4,#666c75);border:1px solid #0b0c0e;box-shadow:0 3px 0 #2a2e34;cursor:grab}
.cc-slider::-moz-range-thumb{width:22px;height:30px;border-radius:5px;background:linear-gradient(180deg,#b7bcc4,#666c75);border:1px solid #0b0c0e;cursor:grab}
.cc-ticks{display:flex;justify-content:space-between;font:10px ui-monospace,Menlo,monospace;color:var(--dim);margin-top:-2px}

.cc-bar,.cc-gate{position:relative;height:6px;border-radius:3px;background:#050607;overflow:hidden}
.cc-bar i{display:block;height:100%;background:var(--amber);transition:width .1s linear}
.cc-gate{overflow:visible;height:8px}
.cc-gate i{display:block;height:100%;border-radius:4px;background:#d68cf0;transition:width .2s}
.cc-gate b{position:absolute;top:-4px;width:2px;height:16px;background:var(--red)}

.cc-side{display:flex;flex-direction:column;gap:12px;min-width:0}
.cc-gauge{background:#0d0f12;border:1px solid var(--edge);border-radius:12px;padding:14px}
.cc-gauge-num{font:700 46px ui-monospace,"JetBrains Mono",Menlo,monospace;line-height:1}
.cc-gauge-num small{font-size:20px;color:var(--dim);margin-left:2px}
.cc-gauge-track{height:8px;border-radius:4px;background:#050607;margin:10px 0 6px;overflow:hidden}
.cc-gauge-track i{display:block;height:100%;background:linear-gradient(90deg,var(--amber),var(--green));transition:width .4s}
.cc-gauge p{margin:0;font-size:12px;color:var(--dim)}
.cc-stats{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cc-stats div{background:#0d0f12;border:1px solid var(--edge);border-radius:10px;padding:8px 10px;min-width:0}
.cc-stats dt{font-size:11.5px;color:var(--dim)}
.cc-stats dd{margin:2px 0 0;font:600 15px ui-monospace,Menlo,monospace;overflow-wrap:anywhere}
.cc-stats dd.ok{color:var(--green)}
.cc-log{background:#08090b;border:1px solid var(--edge);border-radius:12px;padding:10px;height:230px;overflow:auto;font:11.5px/1.45 ui-monospace,Menlo,monospace}
.cc-line{margin:0 0 5px}
.cc-line time{color:#5f636b}
.lv-FAULT{color:#ff8b8e}.lv-WARN{color:var(--amber)}.lv-OK{color:var(--green)}.lv-INFO{color:var(--cyan)}
.cc-empty{margin:0;color:var(--dim)}
@media(prefers-reduced-motion:reduce){.cc-root *{transition:none!important}}
`;
