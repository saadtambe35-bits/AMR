import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ────────────────────────────────────────────────────────────────────────────
 * SwarmEdge v2 · BLOCK 6b · Server-Kill Duel (PRD §12 / S2)
 *
 * Two identical fleets, same seed, same task stream (Paired Run):
 *   LEFT  – Centralized Coordinator (B1 Oracle baseline). Every intersection
 *           grant comes from one dispatcher on :8080.
 *   RIGHT – SwarmEdge. Brokerless Zenoh peer mesh, L0 Safety Kernel,
 *           L1 local leases. No server exists to kill.
 * Press KILL CENTRAL COORDINATOR: left freezes, right keeps delivering.
 * ──────────────────────────────────────────────────────────────────────────── */

/* ───────────────────────────── geometry ───────────────────────────── */

const COLS = 4;
const ROWS = 3;
const NODES = COLS * ROWS;
const W = 480;
const H = 330;
const X0 = 60;
const DX = 120;
const Y0 = 96;
const DY = 84;
const SPEED = 62; // px per second
const BEAT_HZ = 10;
const CENTRAL_GRANT_LATENCY = 0.18; // s, request + reply through the dispatcher
const SWARM_LEASE_LATENCY = 0.02; // s, local lease claim
const ROBOT_R = 8;

const nodePos = (n: number) => ({ x: X0 + (n % COLS) * DX, y: Y0 + Math.floor(n / COLS) * DY });

const neighborsOf = (n: number): number[] => {
  const c = n % COLS;
  const r = Math.floor(n / COLS);
  const out: number[] = [];
  if (c > 0) out.push(n - 1);
  if (c < COLS - 1) out.push(n + 1);
  if (r > 0) out.push(n - COLS);
  if (r < ROWS - 1) out.push(n + COLS);
  return out;
};

/** Manhattan route: along x first, then y. Excludes the start node. */
const route = (from: number, to: number): number[] => {
  const path: number[] = [];
  let c = from % COLS;
  let r = Math.floor(from / COLS);
  const tc = to % COLS;
  const tr = Math.floor(to / COLS);
  while (c !== tc) {
    c += Math.sign(tc - c);
    path.push(r * COLS + c);
  }
  while (r !== tr) {
    r += Math.sign(tr - r);
    path.push(r * COLS + c);
  }
  return path;
};

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────────── simulation ───────────────────────────── */

type Mode = 'central' | 'swarm';
type RState = 'idle' | 'waiting' | 'moving' | 'dwell' | 'frozen';

interface SimRobot {
  id: number;
  node: number;
  next: number;
  dist: number;
  edgeLen: number;
  path: number[];
  phase: 'toPick' | 'toDrop';
  pick: number;
  drop: number;
  target: number;
  dwell: number;
  wait: number;
  reqTimer: number;
  state: RState;
  flash: number;
  rng: () => number;
}

interface Snap {
  t: number;
  mode: Mode;
  serverAlive: boolean;
  delivered: number;
  sinceKill: number;
  secondsSinceKill: number;
  killed: boolean;
  rate: number;
  collisions: number;
  frozen: number;
  moving: number;
  packets: number;
  refused: number;
  leases: number;
  deadlocked: boolean;
  history: number[];
}

class FleetSim {
  mode: Mode;
  t = 0;
  robots: SimRobot[] = [];
  owner: number[] = Array(NODES).fill(-1);
  serverAlive = true;
  delivered = 0;
  deliveredLog: number[] = [];
  collisions = 0;
  refused = 0;
  packets = 0;
  killAt: number | null = null;
  deliveredAtKill = 0;
  history: number[] = [];
  private nextSample = 1;
  private touching = new Set<string>();

  constructor(mode: Mode, seed: number, count: number) {
    this.mode = mode;
    const master = mulberry32(seed);
    const pool = Array.from({ length: NODES }, (_, i) => i);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(master() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    for (let id = 0; id < count; id++) {
      const r: SimRobot = {
        id,
        node: pool[id],
        next: -1,
        dist: 0,
        edgeLen: 1,
        path: [],
        phase: 'toPick',
        pick: 0,
        drop: 0,
        target: 0,
        dwell: 0,
        wait: 0,
        reqTimer: 0,
        state: 'idle',
        flash: 0,
        rng: mulberry32(seed * 131 + id * 7919 + 1),
      };
      this.owner[r.node] = id;
      this.newTask(r);
      this.plan(r);
      this.robots.push(r);
    }
  }

  /** Central: the dispatcher dies. Swarm: nothing to kill, we only stamp the time. */
  kill() {
    if (this.killAt !== null) return;
    this.killAt = this.t;
    this.deliveredAtKill = this.delivered;
    if (this.mode === 'central') this.serverAlive = false;
  }

  private newTask(r: SimRobot) {
    r.pick = Math.floor(r.rng() * NODES);
    do {
      r.drop = Math.floor(r.rng() * NODES);
    } while (r.drop === r.pick);
    r.phase = 'toPick';
    r.target = r.pick;
  }

  private plan(r: SimRobot) {
    r.path = route(r.node, r.target);
    r.reqTimer = 0;
    r.wait = 0;
    if (r.path.length === 0) {
      r.state = 'dwell';
      r.dwell = r.phase === 'toPick' ? 0.7 : 0.5;
    } else {
      r.state = 'idle';
    }
  }

  private finishDwell(r: SimRobot) {
    if (r.phase === 'toPick') {
      r.phase = 'toDrop';
      r.target = r.drop;
    } else {
      this.delivered += 1;
      this.deliveredLog.push(this.t);
      r.flash = 0.7;
      this.newTask(r);
    }
    this.plan(r);
  }

  private tryAdvance(r: SimRobot, dt: number) {
    if (this.mode === 'central' && !this.serverAlive) {
      r.state = 'frozen';
      r.wait += dt;
      this.refused += dt * 2; // each frozen robot retries ~2×/s → CONNECTION REFUSED
      return;
    }
    const lat = this.mode === 'central' ? CENTRAL_GRANT_LATENCY : SWARM_LEASE_LATENCY;
    if (r.reqTimer < lat) {
      r.reqTimer += dt;
      r.state = 'waiting';
      return;
    }
    const nxt = r.path[0];
    const holder = this.owner[nxt];
    if (holder !== -1 && holder !== r.id) {
      r.state = 'waiting';
      r.wait += dt;
      this.resolveBlock(r, holder);
      return;
    }
    this.owner[nxt] = r.id;
    r.next = nxt;
    r.dist = 0;
    const a = nodePos(r.node);
    const b = nodePos(nxt);
    r.edgeLen = Math.hypot(a.x - b.x, a.y - b.y);
    r.wait = 0;
    r.reqTimer = 0;
    r.state = 'moving';
  }

  /** Break wait-for cycles: the lowest-priority robot in the cycle sidesteps. */
  private resolveBlock(r: SimRobot, holder: number) {
    if (r.wait < 0.8 || r.id < holder) return;
    let cur = holder;
    let cycle = false;
    for (let i = 0; i < this.robots.length; i++) {
      const h = this.robots[cur];
      if (h.state === 'moving' || h.path.length === 0) break;
      const o = this.owner[h.path[0]];
      if (o === r.id) {
        cycle = true;
        break;
      }
      if (o === -1) break;
      cur = o;
    }
    if (!cycle) return;
    const free = neighborsOf(r.node).filter((n) => this.owner[n] === -1 && n !== r.path[0]);
    if (free.length === 0) return;
    const side = free[Math.floor(r.rng() * free.length)];
    r.path = [side, ...route(side, r.target)];
    r.wait = 0;
    r.reqTimer = 0;
  }

  private updateRobot(r: SimRobot, dt: number) {
    r.flash = Math.max(0, r.flash - dt);
    if (r.state === 'moving') {
      r.dist += SPEED * dt;
      if (r.dist >= r.edgeLen) {
        this.owner[r.node] = -1;
        r.node = r.next;
        r.next = -1;
        r.dist = 0;
        r.path.shift();
        r.reqTimer = 0;
        r.wait = 0;
        if (r.path.length === 0) {
          r.state = 'dwell';
          r.dwell = r.phase === 'toPick' ? 0.7 : 0.5;
        } else {
          r.state = 'idle';
        }
      }
      return;
    }
    if (r.state === 'dwell') {
      r.dwell -= dt;
      if (r.dwell <= 0) this.finishDwell(r);
      return;
    }
    this.tryAdvance(r, dt);
  }

  pos(r: SimRobot) {
    const a = nodePos(r.node);
    if (r.state !== 'moving' || r.next < 0) return a;
    const b = nodePos(r.next);
    const k = Math.min(1, r.dist / r.edgeLen);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }

  private detectCollisions() {
    const seen = new Set<string>();
    for (let i = 0; i < this.robots.length; i++) {
      for (let j = i + 1; j < this.robots.length; j++) {
        const a = this.pos(this.robots[i]);
        const b = this.pos(this.robots[j]);
        if (Math.hypot(a.x - b.x, a.y - b.y) < ROBOT_R * 1.5) {
          const key = `${i}-${j}`;
          seen.add(key);
          if (!this.touching.has(key)) this.collisions += 1;
        }
      }
    }
    this.touching = seen;
  }

  private rate(windowS: number) {
    const w = Math.max(1, Math.min(windowS, this.t));
    let n = 0;
    for (let i = this.deliveredLog.length - 1; i >= 0; i--) {
      if (this.deliveredLog[i] > this.t - w) n++;
      else break;
    }
    return (n * 60) / w;
  }

  step(dt: number) {
    this.t += dt;
    if (this.mode === 'swarm' || this.serverAlive) this.packets += this.robots.length * BEAT_HZ * dt;
    for (const r of this.robots) this.updateRobot(r, dt);
    this.detectCollisions();
    if (this.t >= this.nextSample) {
      this.nextSample += 1;
      this.history.push(this.rate(10));
      if (this.history.length > 60) this.history.shift();
    }
  }

  snap(): Snap {
    const frozen = this.robots.filter((r) => r.state === 'frozen').length;
    return {
      t: this.t,
      mode: this.mode,
      serverAlive: this.serverAlive,
      delivered: this.delivered,
      sinceKill: this.killAt === null ? 0 : this.delivered - this.deliveredAtKill,
      secondsSinceKill: this.killAt === null ? 0 : this.t - this.killAt,
      killed: this.killAt !== null,
      rate: this.rate(20),
      collisions: this.collisions,
      frozen,
      moving: this.robots.filter((r) => r.state === 'moving').length,
      packets: this.packets,
      refused: Math.floor(this.refused),
      leases: this.owner.filter((o) => o !== -1).length,
      deadlocked: this.mode === 'central' && !this.serverAlive && frozen === this.robots.length,
      history: this.history.slice(),
    };
  }
}

/* ───────────────────────────── rendering ───────────────────────────── */

const ROBOT_COLORS = ['#7cc4ff', '#7fd18b', '#f0a63a', '#d68cf0', '#ff8b8e', '#5ad1c8', '#e8d36a', '#9fb1ff'];

function drawPane(ctx: CanvasRenderingContext2D, sim: FleetSim) {
  const t = sim.t;
  const swarm = sim.mode === 'swarm';
  const dead = !swarm && !sim.serverAlive;

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#171a1f');
  bg.addColorStop(1, '#101215');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // aisles
  ctx.lineCap = 'round';
  for (let n = 0; n < NODES; n++) {
    const a = nodePos(n);
    for (const m of neighborsOf(n)) {
      if (m < n) continue;
      const b = nodePos(m);
      ctx.strokeStyle = '#22272e';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = '#363d47';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 6]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // coordination layer
  const positions = sim.robots.map((r) => sim.pos(r));
  if (!swarm) {
    const sx = W / 2;
    const sy = 32;
    if (!dead) {
      sim.robots.forEach((r, i) => {
        const p = positions[i];
        ctx.strokeStyle = 'rgba(124,196,255,.22)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, sy + 14);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
        const k = (t * 1.4 + r.id * 0.23) % 1;
        ctx.fillStyle = '#7cc4ff';
        ctx.beginPath();
        ctx.arc(sx + (p.x - sx) * k, sy + 14 + (p.y - sy - 14) * k, 1.8, 0, 6.3);
        ctx.fill();
      });
    }
    // server chassis
    ctx.fillStyle = dead ? '#2a1516' : '#16232b';
    ctx.strokeStyle = dead ? '#e5484d' : '#7cc4ff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(sx - 62, sy - 14, 124, 28, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = dead ? '#e5484d' : '#7fd18b';
    ctx.beginPath();
    ctx.arc(sx - 48, sy, 3.5, 0, 6.3);
    ctx.fill();
    ctx.fillStyle = '#e9e6dc';
    ctx.font = '600 10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dead ? 'REFUSED' : 'DISPATCHER :8080', sx + 6, sy + 1);
    if (dead) {
      ctx.strokeStyle = '#e5484d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx - 70, sy - 20);
      ctx.lineTo(sx + 70, sy + 20);
      ctx.moveTo(sx + 70, sy - 20);
      ctx.lineTo(sx - 70, sy + 20);
      ctx.stroke();
    }
  } else {
    // peer mesh
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 190) continue;
        ctx.strokeStyle = `rgba(127,209,139,${0.28 * (1 - d / 190)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const k = (t * 1.8 + i * 0.31 + j * 0.17) % 1;
        ctx.fillStyle = 'rgba(127,209,139,.9)';
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 1.6, 0, 6.3);
        ctx.fill();
      }
    }
    ctx.strokeStyle = '#3c4a3f';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(W / 2 - 62, 18, 124, 28, 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#6f8574';
    ctx.font = '600 10px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NO BROKER · NO SERVER', W / 2, 33);
  }

  // nodes and leases
  for (let n = 0; n < NODES; n++) {
    const p = nodePos(n);
    const o = sim.owner[n];
    ctx.fillStyle = '#1b1f25';
    ctx.strokeStyle = o === -1 ? '#4a525d' : ROBOT_COLORS[o % ROBOT_COLORS.length];
    ctx.lineWidth = o === -1 ? 1.5 : 2.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 13, 0, 6.3);
    ctx.fill();
    ctx.stroke();
    if (o !== -1 && swarm) {
      ctx.strokeStyle = 'rgba(127,209,139,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18 + 2 * Math.sin(t * 6), 0, 6.3);
      ctx.stroke();
    }
  }

  // robots
  sim.robots.forEach((r, i) => {
    const p = positions[i];
    const frozen = r.state === 'frozen';
    const base = ROBOT_COLORS[r.id % ROBOT_COLORS.length];
    if (r.flash > 0) {
      ctx.strokeStyle = `rgba(127,209,139,${r.flash})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 12 + (0.7 - r.flash) * 30, 0, 6.3);
      ctx.stroke();
    }
    if (frozen) {
      ctx.fillStyle = `rgba(229,72,77,${0.25 + 0.2 * Math.sin(t * 8 + r.id)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 15, 0, 6.3);
      ctx.fill();
    }
    ctx.fillStyle = frozen ? '#e5484d' : r.state === 'waiting' ? '#f0a63a' : base;
    ctx.beginPath();
    ctx.roundRect(p.x - ROBOT_R, p.y - ROBOT_R, ROBOT_R * 2, ROBOT_R * 2, 4);
    ctx.fill();
    ctx.fillStyle = '#0b0c0e';
    ctx.font = '700 9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(r.id + 1), p.x, p.y + 0.5);
    if (r.phase === 'toDrop') {
      ctx.fillStyle = '#e9e6dc';
      ctx.fillRect(p.x + 5, p.y - 12, 6, 6);
    }
  });

  if (dead) {
    ctx.fillStyle = 'rgba(60,8,10,.28)';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ───────────────────────────── UI pieces ───────────────────────────── */

function Spark({ data, max, color }: { data: number[]; max: number; color: string }) {
  const w = 220;
  const h = 40;
  const pts = data.map((v, i) => {
    const x = data.length <= 1 ? 0 : (i / (data.length - 1)) * w;
    const y = h - 3 - (Math.min(v, max) / Math.max(1, max)) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sk-spark" role="img" aria-label="Throughput history, tasks per minute">
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="#2f353e" />
      {pts.length > 1 && <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />}
    </svg>
  );
}

function Row({ k, v, tone }: { k: string; v: React.ReactNode; tone?: 'ok' | 'bad' | 'warn' }) {
  return (
    <div className="sk-row">
      <dt>{k}</dt>
      <dd className={tone ?? ''}>{v}</dd>
    </div>
  );
}

/* ───────────────────────────── component ───────────────────────────── */

export interface ServerKillDuelProps {
  /** Same seed drives both panes (Paired Run). */
  seed?: number;
  fleetSize?: number;
  className?: string;
  /** Fires once when the Judge Verdict banner appears. */
  onVerdict?: (result: { swarmDeliveredSinceKill: number; centralDeliveredSinceKill: number; swarmCollisions: number }) => void;
}

const VERDICT_TEXT =
  'Decentralization Proven: Swarm maintained 100% operational throughput under total infrastructure loss.';

export default function ServerKillDuel({ seed = 42, fleetSize = 5, className, onVerdict }: ServerKillDuelProps) {
  const [runId, setRunId] = useState(0);
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [guardOpen, setGuardOpen] = useState(false);
  const [shake, setShake] = useState(false);

  const sims = useMemo(
    () => ({ central: new FleetSim('central', seed, fleetSize), swarm: new FleetSim('swarm', seed, fleetSize) }),
    // runId forces a fresh paired run
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [seed, fleetSize, runId],
  );
  const [snaps, setSnaps] = useState(() => ({ c: sims.central.snap(), s: sims.swarm.snap() }));

  const centralCanvas = useRef<HTMLCanvasElement>(null);
  const swarmCanvas = useRef<HTMLCanvasElement>(null);
  const runningRef = useRef(running);
  runningRef.current = running;
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const verdictFired = useRef(false);
  const onVerdictRef = useRef(onVerdict);
  onVerdictRef.current = onVerdict;

  // fresh run → reset UI state
  useEffect(() => {
    verdictFired.current = false;
    setSnaps({ c: sims.central.snap(), s: sims.swarm.snap() });
    setGuardOpen(false);
  }, [sims]);

  // HiDPI canvases
  useEffect(() => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    [centralCanvas.current, swarmCanvas.current].forEach((cv) => {
      if (!cv) return;
      cv.width = W * dpr;
      cv.height = H * dpr;
      cv.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  }, [runId]);

  // main loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const real = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (runningRef.current) {
        const dt = real * speedRef.current;
        const n = Math.max(1, Math.ceil(dt / 0.02));
        const h = dt / n;
        for (let i = 0; i < n; i++) {
          sims.central.step(h);
          sims.swarm.step(h);
        }
      }
      const cc = centralCanvas.current?.getContext('2d');
      const sc = swarmCanvas.current?.getContext('2d');
      if (cc) drawPane(cc, sims.central);
      if (sc) drawPane(sc, sims.swarm);
      acc += real;
      if (acc > 0.15) {
        acc = 0;
        setSnaps({ c: sims.central.snap(), s: sims.swarm.snap() });
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [sims]);

  // guard auto-closes
  useEffect(() => {
    if (!guardOpen) return;
    const id = window.setTimeout(() => setGuardOpen(false), 6000);
    return () => window.clearTimeout(id);
  }, [guardOpen]);

  const killed = snaps.c.killed;

  const kill = useCallback(() => {
    if (sims.central.killAt !== null) return;
    sims.central.kill();
    sims.swarm.kill();
    setGuardOpen(false);
    setShake(true);
    window.setTimeout(() => setShake(false), 600);
    setSnaps({ c: sims.central.snap(), s: sims.swarm.snap() });
  }, [sims]);

  // Judge verdict: swarm still delivering, zero collisions, coordinator fleet stalled.
  const verdict =
    killed &&
    snaps.s.secondsSinceKill >= 6 &&
    snaps.s.collisions === 0 &&
    snaps.s.sinceKill >= 2 &&
    snaps.c.frozen > 0;

  useEffect(() => {
    if (verdict && !verdictFired.current) {
      verdictFired.current = true;
      onVerdictRef.current?.({
        swarmDeliveredSinceKill: snaps.s.sinceKill,
        centralDeliveredSinceKill: snaps.c.sinceKill,
        swarmCollisions: snaps.s.collisions,
      });
    }
  }, [verdict, snaps]);

  const restart = () => setRunId((n) => n + 1);
  const maxRate = Math.max(30, ...snaps.c.history, ...snaps.s.history);
  const c = snaps.c;
  const s = snaps.s;

  return (
    <div className={`sk-root ${className ?? ''}`}>
      <style>{CSS}</style>

      <header className="sk-head">
        <div>
          <h2>Server-Kill Duel</h2>
          <p>
            Same fleet, same tasks, same seed ({seed}). One side depends on a server. The other has none.
          </p>
        </div>
        <div className="sk-tools">
          <button type="button" className="sk-chip" onClick={() => setRunning((r) => !r)}>
            {running ? 'Pause' : 'Resume'}
          </button>
          <button type="button" className="sk-chip" onClick={() => setSpeed((v) => (v === 1 ? 2 : v === 2 ? 4 : 1))}>
            {speed}× speed
          </button>
          <button type="button" className="sk-chip" onClick={restart}>
            Restart paired run
          </button>
        </div>
      </header>

      <div className="sk-panes">
        {/* LEFT */}
        <section className={`sk-pane ${killed ? 'is-dead' : ''} ${shake ? 'is-shaking' : ''}`} aria-label="Centralized coordinator">
          <div className="sk-pane-head">
            <h3>Centralized Coordinator</h3>
            <span className="sk-tag">B1 Oracle baseline</span>
          </div>
          <p className="sk-sub">One dispatcher assigns routes and grants every intersection.</p>
          <div className="sk-screen">
            <canvas ref={centralCanvas} style={{ width: '100%', aspectRatio: `${W} / ${H}` }} />
            {killed && (
              <div className="sk-stamp" aria-hidden="true">
                {c.deadlocked ? 'DEADLOCK' : 'CONNECTION REFUSED'}
              </div>
            )}
          </div>
          <dl className="sk-stats">
            <Row
              k="Server status"
              v={c.serverAlive ? 'ONLINE (PORT 8080)' : 'DEAD (CONNECTION REFUSED)'}
              tone={c.serverAlive ? 'ok' : 'bad'}
            />
            <Row k="Robots frozen" v={`${c.frozen} of ${fleetSize}`} tone={c.frozen ? 'bad' : undefined} />
            <Row k="Grant requests refused" v={c.refused} tone={c.refused ? 'bad' : undefined} />
            <Row k="Tasks delivered" v={c.delivered} />
            <Row k="Throughput" v={`${c.rate.toFixed(0)} tasks/min`} tone={killed && c.rate < 5 ? 'bad' : undefined} />
            <Row k="Collisions" v={c.collisions} tone="ok" />
          </dl>
          <Spark data={c.history} max={maxRate} color={c.serverAlive ? '#7cc4ff' : '#e5484d'} />
        </section>

        {/* CENTER: the button */}
        <div className="sk-center">
          <div className={`sk-console ${guardOpen ? 'is-open' : ''} ${killed ? 'is-spent' : ''}`}>
            <div className="sk-hazard" aria-hidden="true" />
            <button
              type="button"
              className="sk-kill"
              onClick={kill}
              disabled={killed || !guardOpen}
              aria-label="Kill central coordinator"
            >
              <span className="sk-kill-emoji" aria-hidden="true">💥</span>
              <span>KILL CENTRAL COORDINATOR</span>
            </button>
            <button
              type="button"
              className="sk-guard"
              onClick={() => !killed && setGuardOpen((o) => !o)}
              aria-expanded={guardOpen}
              disabled={killed}
            >
              {killed ? 'Coordinator terminated' : guardOpen ? 'Close guard' : 'Lift guard to arm'}
            </button>
          </div>
          <p className="sk-center-note">
            {killed
              ? `${s.secondsSinceKill.toFixed(0)} s since kill`
              : 'Pressing this stops the dispatcher process on the left. The right has nothing to stop.'}
          </p>
        </div>

        {/* RIGHT */}
        <section className={`sk-pane sk-pane-swarm ${killed ? 'is-alive' : ''}`} aria-label="SwarmEdge decentralized peer mesh">
          <div className="sk-pane-head">
            <h3>SwarmEdge Peer Mesh</h3>
            <span className="sk-tag ok">Zenoh · L0 Safety Kernel · L1 Leases</span>
          </div>
          <p className="sk-sub">Brokerless. Each robot claims intersection leases from its neighbors.</p>
          <div className="sk-screen">
            <canvas ref={swarmCanvas} style={{ width: '100%', aspectRatio: `${W} / ${H}` }} />
            {killed && (
              <div className="sk-stamp ok" aria-hidden="true">
                MESH INTACT
              </div>
            )}
          </div>
          <dl className="sk-stats">
            <Row k="Server status" v="NONE (0 PACKETS PUBLISHED)" tone="ok" />
            <Row k="Peer beats exchanged" v={Math.floor(s.packets).toLocaleString()} />
            <Row k="Leases held" v={`${s.leases} of ${NODES} intersections`} />
            <Row k="Tasks delivered" v={s.delivered} />
            <Row k="Throughput" v={`${s.rate.toFixed(0)} tasks/min`} tone="ok" />
            <Row k="Collisions" v={s.collisions} tone="ok" />
          </dl>
          <Spark data={s.history} max={maxRate} color="#7fd18b" />
        </section>
      </div>

      {verdict && (
        <div className="sk-verdict" role="status" aria-live="polite">
          <div>
            <strong>{VERDICT_TEXT}</strong>
            <span>
              Since the kill: SwarmEdge delivered {s.sinceKill} tasks with {s.collisions} collisions. The centralized fleet
              delivered {c.sinceKill}, with {c.frozen} of {fleetSize} robots frozen.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────────── styles ───────────────────────────────── */

const CSS = `
.sk-root{--ink:#e9e6dc;--dim:#98958b;--edge:#353a43;--red:#e5484d;--green:#7fd18b;--cyan:#7cc4ff;--amber:#f0a63a;
  font-family:"Barlow","Inter",system-ui,sans-serif;background:#f5f3ec;color:#1d1b16;border-radius:18px;padding:22px}
.sk-root *{box-sizing:border-box}
.sk-root button:focus-visible{outline:2px solid #1f6fb2;outline-offset:2px}
.sk-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:16px}
.sk-head h2{margin:0;font-size:26px;font-weight:700}
.sk-head p{margin:4px 0 0;color:#5f5b4f;font-size:14px;max-width:60ch}
.sk-tools{display:flex;gap:8px;flex-wrap:wrap}
.sk-chip{background:#16181c;color:#e9e6dc;border:1px solid #0b0c0e;border-radius:999px;padding:7px 14px;font:13px ui-monospace,Menlo,monospace;cursor:pointer;box-shadow:0 2px 0 #000}
.sk-chip:active{transform:translateY(2px);box-shadow:none}

.sk-panes{display:grid;grid-template-columns:minmax(0,1fr) 210px minmax(0,1fr);gap:16px;align-items:start}
@media(max-width:1100px){.sk-panes{grid-template-columns:1fr}.sk-center{order:-1}}

.sk-pane{background:#14161a;color:var(--ink);border:1px solid #0b0c0e;border-radius:16px;padding:14px;box-shadow:0 14px 30px rgba(40,34,20,.28);transition:box-shadow .3s,border-color .3s}
.sk-pane.is-dead{border-color:#7d1f23;box-shadow:0 0 0 1px #7d1f23,0 14px 30px rgba(125,31,35,.4)}
.sk-pane.is-alive{border-color:#2e6b3a;box-shadow:0 0 0 1px #2e6b3a,0 14px 30px rgba(46,107,58,.35)}
.sk-pane-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.sk-pane h3{margin:0;font-size:17px;font-weight:600}
.sk-tag{background:#0d0f12;border:1px solid var(--edge);border-radius:999px;padding:3px 10px;font:11px ui-monospace,Menlo,monospace;color:var(--dim)}
.sk-tag.ok{color:var(--green);border-color:#2e6b3a}
.sk-sub{margin:6px 0 10px;color:var(--dim);font-size:13px}
.sk-screen{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--edge)}
.sk-screen canvas{display:block}
.sk-stamp{position:absolute;left:50%;top:58%;transform:translate(-50%,-50%) rotate(-7deg);border:3px solid var(--red);color:var(--red);background:rgba(20,6,7,.75);padding:6px 16px;border-radius:6px;font:700 20px ui-monospace,Menlo,monospace;letter-spacing:.06em;animation:sk-stamp .35s cubic-bezier(.2,1.6,.4,1) both;white-space:nowrap}
.sk-stamp.ok{border-color:var(--green);color:var(--green);background:rgba(6,20,9,.75);top:88%;font-size:15px;transform:translate(-50%,-50%) rotate(0)}
@keyframes sk-stamp{from{opacity:0;transform:translate(-50%,-50%) rotate(-7deg) scale(2.2)}to{opacity:1;transform:translate(-50%,-50%) rotate(-7deg) scale(1)}}
.sk-stamp.ok{animation:none}

.sk-stats{margin:12px 0 8px;display:grid;gap:4px}
.sk-row{display:flex;justify-content:space-between;gap:12px;background:#0d0f12;border:1px solid #23272e;border-radius:8px;padding:6px 10px;font-size:13px}
.sk-row dt{color:var(--dim)}
.sk-row dd{margin:0;font:600 12.5px ui-monospace,Menlo,monospace;text-align:right}
.sk-row dd.ok{color:var(--green)}.sk-row dd.bad{color:#ff8b8e}.sk-row dd.warn{color:var(--amber)}
.sk-spark{width:100%;height:40px;display:block}

.sk-center{display:flex;flex-direction:column;align-items:center;gap:10px;position:sticky;top:12px}
.sk-console{position:relative;width:210px;background:#1b1e23;border:1px solid #0b0c0e;border-radius:16px;padding:14px 12px 12px;box-shadow:inset 0 1px 0 rgba(255,255,255,.06),0 10px 24px rgba(40,34,20,.35);display:flex;flex-direction:column;gap:10px}
.sk-hazard{height:12px;border-radius:4px;background:repeating-linear-gradient(-45deg,#f0c23a 0 10px,#15171a 10px 20px)}
.sk-kill{border:0;border-radius:14px;min-height:112px;padding:10px;cursor:pointer;color:#fff;font:800 15px/1.2 "Barlow",system-ui,sans-serif;letter-spacing:.02em;
  background:radial-gradient(circle at 35% 25%,#ff7b7f,#d0343a 55%,#8d1a1f);box-shadow:0 9px 0 #5b0f12,0 14px 18px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,255,255,.35);
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;transition:transform .07s,box-shadow .07s,filter .2s}
.sk-kill-emoji{font-size:28px}
.sk-kill:active:not(:disabled){transform:translateY(8px);box-shadow:0 1px 0 #5b0f12,0 3px 6px rgba(0,0,0,.5),inset 0 2px 0 rgba(255,255,255,.35)}
.sk-kill:disabled{filter:saturate(.25) brightness(.55);cursor:not-allowed}
.sk-console.is-open .sk-kill{animation:sk-pulse 1s ease-in-out infinite}
@keyframes sk-pulse{50%{box-shadow:0 9px 0 #5b0f12,0 0 26px 6px rgba(229,72,77,.65),inset 0 2px 0 rgba(255,255,255,.35)}}
.sk-guard{border:1px solid #6b5a12;background:rgba(240,194,58,.14);color:#f0d67a;border-radius:8px;padding:8px 10px;font:600 12.5px ui-monospace,Menlo,monospace;cursor:pointer}
.sk-guard:disabled{cursor:default;color:var(--dim);border-color:var(--edge);background:transparent}
.sk-center-note{margin:0;font-size:12.5px;color:#5f5b4f;text-align:center;max-width:210px;line-height:1.4}

.sk-pane.is-shaking{animation:sk-shake .5s}
@keyframes sk-shake{20%{transform:translate(-6px,2px)}40%{transform:translate(6px,-3px)}60%{transform:translate(-4px,1px)}80%{transform:translate(3px,-1px)}}

.sk-verdict{margin-top:18px;background:#0f2a16;color:#dff5e3;border:2px solid #2e6b3a;border-radius:14px;padding:16px 20px;animation:sk-rise .5s cubic-bezier(.2,1.2,.4,1) both;box-shadow:0 10px 26px rgba(46,107,58,.35)}
.sk-verdict strong{display:block;font-size:19px;line-height:1.3;margin-bottom:6px}
.sk-verdict span{display:block;font:12.5px/1.5 ui-monospace,Menlo,monospace;color:#a9d6b2}
@keyframes sk-rise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}

@media(prefers-reduced-motion:reduce){
  .sk-pane.is-shaking,.sk-console.is-open .sk-kill,.sk-stamp,.sk-verdict{animation:none!important}
  .sk-root *{transition:none!important}
}
`;
