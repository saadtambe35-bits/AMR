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
const ROBOT_R = 10;

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
  heading: number;
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
        heading: 0,
        rng: mulberry32(seed * 131 + id * 7919 + 1),
      };
      this.owner[r.node] = id;
      this.newTask(r);
      this.plan(r);
      this.robots.push(r);
    }
  }

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
    r.dist = 0;
    r.next = -1;
    r.reqTimer = 0;
    r.wait = 0;
    r.state = r.path.length === 0 ? 'dwell' : 'idle';
    if (r.state === 'dwell') r.dwell = 0.5;
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
      this.refused += dt * 2;
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
    if (r.edgeLen > 0.01) {
      r.heading = Math.atan2(b.y - a.y, b.x - a.x);
    }
    r.wait = 0;
    r.reqTimer = 0;
    r.state = 'moving';
  }

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

const ROBOT_COLORS = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#eab308', '#6366f1'];

function drawPane(ctx: CanvasRenderingContext2D, sim: FleetSim) {
  const t = sim.t;
  const swarm = sim.mode === 'swarm';
  const dead = !swarm && !sim.serverAlive;

  ctx.clearRect(0, 0, W, H);

  // 1. High-tech Dark Cyber Warehouse Floor
  const bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, '#090e18');
  bg.addColorStop(1, '#05080f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Micro blueprint coordinate grid
  ctx.strokeStyle = 'rgba(30, 58, 95, 0.25)';
  ctx.lineWidth = 1;
  const gridStep = 24;
  for (let x = gridStep; x < W; x += gridStep) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = gridStep; y < H; y += gridStep) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // 2. Heavy Structural Trackways (Aisles)
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let n = 0; n < NODES; n++) {
    const a = nodePos(n);
    for (const m of neighborsOf(n)) {
      if (m < n) continue;
      const b = nodePos(m);

      // Trackbed steel road base
      ctx.strokeStyle = '#0f1827';
      ctx.lineWidth = 16;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Outer metallic guide rails
      ctx.strokeStyle = '#1e2d42';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Center glowing navigational dashed laser strip
      ctx.strokeStyle = swarm ? 'rgba(16, 185, 129, 0.4)' : 'rgba(56, 189, 248, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 7]);
      ctx.lineDashOffset = -t * 12;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // 3. Coordination Network Layer
  const positions = sim.robots.map((r) => sim.pos(r));

  if (!swarm) {
    // CENTRALIZED DISPATCHER
    const sx = W / 2;
    const sy = 34;

    if (!dead) {
      // Live cyan heartbeat links from dispatcher to each AMR
      sim.robots.forEach((r, i) => {
        const p = positions[i];
        ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sx, sy + 14);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated streaming energy data packets
        const k = (t * 1.8 + r.id * 0.23) % 1;
        ctx.fillStyle = '#38bdf8';
        ctx.shadowColor = '#0ea5e9';
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(sx + (p.x - sx) * k, sy + 14 + (p.y - sy - 14) * k, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    } else {
      // Severed links with electrical malfunction sparks
      sim.robots.forEach((r, i) => {
        const p = positions[i];
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        ctx.moveTo(sx, sy + 14);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Electrical arc sparks at server
      for (let s = 0; s < 3; s++) {
        const ox = (Math.sin(t * 20 + s * 3) * 50);
        const oy = (Math.cos(t * 25 + s * 2) * 12);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + oy);
        ctx.lineTo(sx + ox + 6, sy + oy - 5);
        ctx.lineTo(sx + ox + 12, sy + oy + 3);
        ctx.stroke();
      }
    }

    // Mainframe Server Blade Chassis
    ctx.save();
    ctx.fillStyle = dead ? '#2a0a0a' : '#0b1322';
    ctx.strokeStyle = dead ? '#ef4444' : '#0ea5e9';
    ctx.lineWidth = dead ? 2 : 1.5;
    if (dead) {
      ctx.shadowColor = '#ef4444';
      ctx.shadowBlur = 12;
    } else {
      ctx.shadowColor = '#0ea5e9';
      ctx.shadowBlur = 8;
    }
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(sx - 70, sy - 15, 140, 30, 6);
    else ctx.rect(sx - 70, sy - 15, 140, 30);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Blinking status LED
    const ledColor = dead ? (Math.sin(t * 12) > 0 ? '#ef4444' : '#7f1d1d') : '#10b981';
    ctx.fillStyle = ledColor;
    ctx.beginPath();
    ctx.arc(sx - 54, sy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Secondary communication pulse LED
    if (!dead) {
      ctx.fillStyle = Math.sin(t * 8) > 0 ? '#38bdf8' : '#0369a1';
      ctx.beginPath();
      ctx.arc(sx - 42, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Server Callout Text
    ctx.fillStyle = dead ? '#ef4444' : '#ffffff';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(dead ? '502 REFUSED · DROPPED' : 'DISPATCHER :8080', sx + 10, sy);

  } else {
    // SWARMEDGE PEER MESH
    // P2P Inter-robot wireless laser links
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const a = positions[i];
        const b = positions[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d > 220) continue;

        const alpha = 0.55 * (1 - d / 220);
        ctx.strokeStyle = `rgba(16, 185, 129, ${alpha})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();

        // High-frequency animated telemetry packets between peers
        const k = (t * 2.2 + i * 0.35 + j * 0.19) % 1;
        ctx.fillStyle = '#34d399';
        ctx.beginPath();
        ctx.arc(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Top "BROKERLESS ZENOH PEER MESH" Badge
    ctx.save();
    ctx.fillStyle = 'rgba(7, 26, 20, 0.9)';
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#10b981';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(W / 2 - 80, 19, 160, 28, 6);
    else ctx.rect(W / 2 - 80, 19, 160, 28);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Green Active Shield Icon & Monospace Text
    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.arc(W / 2 - 62, 33, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#e2e8f0';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ZENOH P2P · BROKERLESS', W / 2 + 6, 33);
  }

  // 4. Intersection Nodes & Active Lease Zones
  for (let n = 0; n < NODES; n++) {
    const p = nodePos(n);
    const o = sim.owner[n];
    const isLeased = o !== -1;
    const leaseColor = isLeased ? ROBOT_COLORS[o % ROBOT_COLORS.length] : '#1e293b';

    // Outer Docking Ring
    ctx.fillStyle = '#0a101d';
    ctx.strokeStyle = isLeased ? leaseColor : '#1e2e45';
    ctx.lineWidth = isLeased ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Center optical sensor pad
    ctx.fillStyle = isLeased ? leaseColor : '#162234';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();

    // Swarm localized lease broadcast envelope
    if (isLeased && swarm) {
      const pulseR = 17 + 3 * Math.sin(t * 6 + n);
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // 5. Tactical Autonomous Mobile Robots (AMRs)
  sim.robots.forEach((r, i) => {
    const p = positions[i];
    const frozen = r.state === 'frozen';
    const base = ROBOT_COLORS[r.id % ROBOT_COLORS.length];

    // Delivery completion pulse shockwave
    if (r.flash > 0) {
      ctx.strokeStyle = `rgba(16, 185, 129, ${r.flash})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14 + (0.7 - r.flash) * 36, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Frozen state red emergency warning halo
    if (frozen) {
      const blink = Math.sin(t * 10 + r.id) > 0 ? 0.45 : 0.15;
      ctx.fillStyle = `rgba(239, 68, 68, ${blink})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 19, 0, Math.PI * 2);
      ctx.fill();
    }

    // Swarm RF radio transmission ripple
    if (swarm) {
      const rippleR = 12 + 6 * ((t * 0.8 + r.id * 0.3) % 1);
      const rippleA = 0.3 * (1 - (rippleR - 12) / 6);
      ctx.strokeStyle = `rgba(16, 185, 129, ${rippleA})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rippleR, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Directional AMR Chassis
    ctx.save();
    ctx.translate(p.x, p.y);
    const heading = r.heading || 0;
    ctx.rotate(heading);

    // Forward Headlight Beams (Volumetric Light Cone)
    if (!frozen) {
      const beamL = 26;
      const beamW = 16;
      const grad = ctx.createRadialGradient(ROBOT_R, 0, 2, beamL, 0, beamL);
      grad.addColorStop(0, 'rgba(56, 189, 248, 0.45)');
      grad.addColorStop(1, 'rgba(56, 189, 248, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(ROBOT_R, 0);
      ctx.lineTo(beamL, -beamW / 2);
      ctx.lineTo(beamL, beamW / 2);
      ctx.closePath();
      ctx.fill();
    }

    // 4 Corner Mecanum Wheel Pods
    ctx.fillStyle = '#060a12';
    ctx.fillRect(-ROBOT_R + 1, -ROBOT_R - 2.5, 5, 2.5);
    ctx.fillRect(ROBOT_R - 6, -ROBOT_R - 2.5, 5, 2.5);
    ctx.fillRect(-ROBOT_R + 1, ROBOT_R, 5, 2.5);
    ctx.fillRect(ROBOT_R - 6, ROBOT_R, 5, 2.5);

    // Beveled Octagonal Armor Hull
    const rx = ROBOT_R + 1;
    const ry = ROBOT_R;
    const c = 3.5;
    ctx.fillStyle = frozen ? '#2a0a0e' : '#0e1624';
    ctx.strokeStyle = frozen ? '#ef4444' : r.state === 'waiting' ? '#f59e0b' : base;
    ctx.lineWidth = 1.8;

    ctx.beginPath();
    ctx.moveTo(-rx + c, -ry);
    ctx.lineTo(rx - c, -ry);
    ctx.lineTo(rx, -ry + c);
    ctx.lineTo(rx, ry - c);
    ctx.lineTo(rx - c, ry);
    ctx.lineTo(-rx + c, ry);
    ctx.lineTo(-rx, ry - c);
    ctx.lineTo(-rx, -ry + c);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dual Front Headlight Diodes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(rx - 1, -ry * 0.5, 1.4, 0, Math.PI * 2);
    ctx.arc(rx - 1, ry * 0.5, 1.4, 0, Math.PI * 2);
    ctx.fill();

    // Carried Cargo Crate on Deck (When In Transit to Drop)
    if (r.phase === 'toDrop') {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(-rx + 2, -ry + 2.5, rx * 1.05, (ry - 2.5) * 2);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1;
      ctx.strokeRect(-rx + 2, -ry + 2.5, rx * 1.05, (ry - 2.5) * 2);
    }

    // Central Robot ID
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(r.id + 1), 0, 0);

    ctx.restore();
  });

  // 6. Overall Failure Stamp on Central Side
  if (dead) {
    ctx.fillStyle = 'rgba(239, 68, 68, 0.08)';
    ctx.fillRect(0, 0, W, H);
  }
}

/* ───────────────────────────── UI pieces ───────────────────────────── */

function Spark({ data, max, color }: { data: number[]; max: number; color: string }) {
  const w = 220;
  const h = 42;
  const pts = data.map((v, i) => {
    const x = data.length <= 1 ? 0 : (i / (data.length - 1)) * w;
    const y = h - 4 - (Math.min(v, max) / Math.max(1, max)) * (h - 10);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPts = pts.length > 1 ? [`0,${h - 2}`, ...pts, `${w},${h - 2}`].join(' ') : '';
  const gradId = `spark-grad-${color.replace('#', '')}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="sk-spark" role="img" aria-label="Throughput history, tasks per minute">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.32" />
          <stop offset="100%" stopColor={color} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <line x1="0" y1={h - 2} x2={w} y2={h - 2} stroke="#1f293d" strokeDasharray="3 3" />
      {areaPts && <polygon points={areaPts} fill={`url(#${gradId})`} />}
      {pts.length > 1 && (
        <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      )}
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
  seed?: number;
  fleetSize?: number;
  className?: string;
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

  // Fresh run reset
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

  // Main loop
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

  useEffect(() => {
    if (!guardOpen) return;
    const id = window.setTimeout(() => setGuardOpen(false), 8000);
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
          <button
            type="button"
            className="sk-chip"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? 'Pause' : 'Resume'}
          </button>
          <button
            type="button"
            className="sk-chip"
            onClick={() => setSpeed((v) => (v === 1 ? 2 : v === 2 ? 4 : 1))}
          >
            {speed}× speed
          </button>
          <button type="button" className="sk-chip" onClick={restart}>
            Restart paired run
          </button>
        </div>
      </header>

      <div className="sk-panes">
        {/* LEFT: Centralized */}
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
          <Spark data={c.history} max={maxRate} color={c.serverAlive ? '#38bdf8' : '#ef4444'} />
        </section>

        {/* CENTER: Heavy Industrial Kill Switch Console */}
        <div className="sk-center">
          <div className={`sk-console ${guardOpen ? 'is-open' : ''} ${killed ? 'is-spent' : ''}`}>
            <div className="sk-hazard" aria-hidden="true" />

            <div className="sk-switch-housing">
              <button
                type="button"
                className="sk-kill"
                onClick={kill}
                disabled={killed || !guardOpen}
                aria-label="Kill central coordinator"
              >
                <span className="sk-kill-emoji" aria-hidden="true">⚡</span>
                <span>KILL CENTRAL COORDINATOR</span>
              </button>

              {/* Physical Flip-Up Ballistic Glass Safety Cover */}
              <div
                className={`sk-glass-guard ${guardOpen ? 'is-open' : 'is-closed'}`}
                onClick={() => !killed && setGuardOpen((o) => !o)}
                title={guardOpen ? "Click to close glass guard" : "Click to lift glass guard"}
                aria-hidden="true"
              >
                <div className="sk-glass-hinge">
                  <span className="sk-hinge-bolt" />
                  <span className="sk-hinge-pin" />
                  <span className="sk-hinge-bolt" />
                </div>
                <div className="sk-glass-panel">
                  <div className="sk-glass-glare" />
                  <div className="sk-glass-label">
                    <span className="sk-glass-lock-icon">🔒</span>
                    <span>SAFETY INTERLOCK</span>
                  </div>
                  <div className="sk-glass-lip">
                    <span className="sk-lip-grip" />
                    <span className="sk-lip-text">LIFT TO ARM</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              className="sk-guard"
              onClick={() => !killed && setGuardOpen((o) => !o)}
              aria-expanded={guardOpen}
              disabled={killed}
            >
              {killed ? 'Coordinator terminated' : guardOpen ? 'Close glass guard' : 'Lift guard to arm'}
            </button>
          </div>
          <p className="sk-center-note">
            {killed
              ? `${s.secondsSinceKill.toFixed(0)} s since kill`
              : 'Pressing this stops the dispatcher process on the left. The right has nothing to stop.'}
          </p>
        </div>

        {/* RIGHT: SwarmEdge Decentralized */}
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
                MESH INTACT · 100%
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
          <Spark data={s.history} max={maxRate} color="#10b981" />
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
.sk-root {
  --ink: #f1f5f9;
  --dim: #94a3b8;
  --edge: #1e293b;
  --red: #ef4444;
  --green: #10b981;
  --cyan: #0ea5e9;
  --amber: #f59e0b;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  background: #090e18 !important;
  color: #f1f5f9;
  border: 1px solid #1e293b !important;
  border-radius: 16px;
  padding: 20px;
  box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.08) !important;
  position: relative;
}
.sk-root * { box-sizing: border-box; }
.sk-root button:focus-visible { outline: 2px solid #0ea5e9; outline-offset: 2px; }

.sk-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-end;
  margin-bottom: 16px;
}
.sk-head h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 900;
  color: #f8fafc;
  letter-spacing: -0.02em;
}
.sk-head p {
  margin: 4px 0 0;
  color: #94a3b8;
  font-size: 13.5px;
  max-width: 60ch;
  font-weight: 500;
}
.sk-tools {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.sk-chip {
  background: #0f172a;
  color: #cbd5e1;
  border: 1px solid #1e293b;
  border-radius: 999px;
  padding: 6px 14px;
  font: 700 12px ui-monospace, Menlo, monospace;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
}
.sk-chip:hover {
  background: #1e293b;
  color: #f8fafc;
  border-color: #38bdf888;
  transform: translateY(-1px);
}
.sk-chip:active {
  transform: translateY(1px);
}

.sk-panes {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 1100px) {
  .sk-panes { grid-template-columns: 1fr; }
  .sk-center { order: -1; }
}

.sk-pane {
  background: #0b1322;
  color: #f8fafc;
  border: 1px solid #172640;
  border-radius: 12px;
  padding: 14px;
  box-shadow: 0 12px 28px -8px rgba(0, 0, 0, 0.5);
  transition: box-shadow 0.3s, border-color 0.3s;
}
.sk-pane.is-dead {
  border-color: #ef4444;
  box-shadow: 0 0 0 1px #ef4444, 0 14px 28px rgba(239, 68, 68, 0.25);
}
.sk-pane.is-alive {
  border-color: #10b981;
  box-shadow: 0 0 0 1px #10b981, 0 14px 28px rgba(16, 185, 129, 0.25);
}
.sk-pane-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.sk-pane h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: #f8fafc;
}
.sk-tag {
  background: #141d2e;
  border: 1px solid #1e355b;
  border-radius: 999px;
  padding: 3px 10px;
  font: 700 11px ui-monospace, Menlo, monospace;
  color: #38bdf8;
}
.sk-tag.ok {
  color: #34d399;
  border-color: rgba(16, 185, 129, 0.4);
  background: rgba(16, 185, 129, 0.12);
}
.sk-sub {
  margin: 6px 0 10px;
  color: #94a3b8;
  font-size: 13px;
  font-weight: 500;
}
.sk-screen {
  position: relative;
  border-radius: 8px;
  overflow: hidden;
  background: #05080f !important;
  border: 1px solid #1e293b !important;
  box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.8) !important;
}
.sk-screen canvas {
  display: block;
}
.sk-stamp {
  position: absolute;
  left: 50%;
  top: 58%;
  transform: translate(-50%, -50%) rotate(-6deg);
  border: 2px solid #ef4444;
  color: #ffffff;
  background: rgba(185, 28, 28, 0.95);
  padding: 6px 16px;
  border-radius: 6px;
  font: 900 18px ui-monospace, Menlo, monospace;
  letter-spacing: 0.08em;
  animation: sk-stamp 0.35s cubic-bezier(0.2, 1.6, 0.4, 1) both;
  white-space: nowrap;
  box-shadow: 0 0 24px rgba(239, 68, 68, 0.7);
}
.sk-stamp.ok {
  border-color: #10b981;
  color: #ffffff;
  background: rgba(6, 95, 70, 0.95);
  top: 88%;
  font-size: 13px;
  transform: translate(-50%, -50%) rotate(0);
  box-shadow: 0 0 18px rgba(16, 185, 129, 0.5);
  animation: none;
}
@keyframes sk-stamp {
  from { opacity: 0; transform: translate(-50%, -50%) rotate(-6deg) scale(2.2); }
  to { opacity: 1; transform: translate(-50%, -50%) rotate(-6deg) scale(1); }
}

.sk-stats {
  margin: 12px 0 8px;
  display: grid;
  gap: 4px;
}
.sk-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  background: #070b14;
  border: 1px solid #162032;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 12.5px;
}
.sk-row dt {
  color: #94a3b8;
  font-weight: 500;
}
.sk-row dd {
  margin: 0;
  font: 700 12.5px ui-monospace, Menlo, monospace;
  font-variant-numeric: tabular-nums;
  text-align: right;
  color: #f1f5f9;
}
.sk-row dd.ok { color: #10b981; }
.sk-row dd.bad { color: #ef4444; }
.sk-row dd.warn { color: #f59e0b; }
.sk-spark {
  width: 100%;
  height: 42px;
  display: block;
}

/* Center Detonator Console */
.sk-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  position: sticky;
  top: 12px;
}
.sk-console {
  position: relative;
  width: 210px;
  background: #0b1322;
  border: 1px solid #1e293b;
  border-radius: 14px;
  padding: 14px 12px 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sk-hazard {
  height: 12px;
  border-radius: 4px;
  background: repeating-linear-gradient(-45deg, #eab308 0 10px, #0b1322 10px 20px);
  border: 1px solid rgba(234, 179, 8, 0.4);
}
.sk-switch-housing {
  position: relative;
  width: 100%;
  perspective: 800px;
}
.sk-kill {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  min-height: 112px;
  padding: 10px;
  cursor: pointer;
  color: #fff;
  font: 900 14px/1.2 "Inter", system-ui, sans-serif;
  letter-spacing: 0.04em;
  background: radial-gradient(circle at 35% 25%, #ff4d6d 0%, #dc2626 55%, #881337 100%) !important;
  box-shadow: 0 6px 0 #700c28, 0 12px 24px rgba(220, 38, 38, 0.4), inset 0 1px 2px rgba(255, 255, 255, 0.5) !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: transform 0.08s ease, box-shadow 0.08s ease, filter 0.2s;
}
.sk-kill-emoji {
  font-size: 26px;
}
.sk-kill:active:not(:disabled) {
  transform: translateY(2px) !important;
  box-shadow: 0 4px 0 #700c28, 0 6px 12px rgba(220, 38, 38, 0.35), inset 0 1px 2px rgba(255, 255, 255, 0.3) !important;
}
.sk-kill:disabled {
  filter: saturate(0.2) brightness(0.6);
  cursor: not-allowed;
  box-shadow: 0 4px 0 #700c28;
}
.sk-console.is-open .sk-kill {
  animation: sk-pulse 1s ease-in-out infinite;
}
@keyframes sk-pulse {
  50% {
    box-shadow: 0 6px 0 #700c28, 0 0 28px 8px rgba(239, 68, 68, 0.8), inset 0 1px 2px rgba(255, 255, 255, 0.5);
  }
}

/* Realistic Physical 3D Ballistic Glass Flip Safety Cover */
.sk-glass-guard {
  position: absolute;
  inset: 0;
  z-index: 10;
  transform-origin: top center;
  transition: transform 0.45s cubic-bezier(0.34, 1.35, 0.64, 1), box-shadow 0.4s ease;
  transform-style: preserve-3d;
  cursor: pointer;
  display: flex;
  flex-direction: column;
}

/* Top Heavy Steel Hinge */
.sk-glass-hinge {
  height: 9px;
  background: linear-gradient(180deg, #475569 0%, #1e293b 50%, #0f172a 100%);
  border: 1px solid #64748b;
  border-radius: 4px 4px 0 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
}
.sk-hinge-bolt {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #cbd5e1;
  box-shadow: inset 0 1px 1px #000;
}
.sk-hinge-pin {
  height: 2px;
  flex: 1;
  margin: 0 6px;
  background: #94a3b8;
  border-radius: 1px;
}

/* Main Ballistic Glass Panel */
.sk-glass-panel {
  flex: 1;
  position: relative;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.24) 0%, rgba(255, 255, 255, 0.06) 50%, rgba(14, 165, 233, 0.15) 100%);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  border: 1.5px solid rgba(255, 255, 255, 0.5);
  border-top: none;
  border-radius: 0 0 12px 12px;
  box-shadow:
    inset 0 1px 2px rgba(255, 255, 255, 0.8),
    inset 0 -2px 6px rgba(0, 0, 0, 0.4),
    0 8px 24px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
}

/* Diagonal Specular Reflection Glare across the Glass */
.sk-glass-glare {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(115deg,
    transparent 35%,
    rgba(255, 255, 255, 0.38) 45%,
    rgba(255, 255, 255, 0.1) 50%,
    transparent 58%
  );
}

/* Interlock Label stenciled on the glass */
.sk-glass-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  font: 800 10px ui-monospace, Menlo, monospace;
  letter-spacing: 0.08em;
  color: #f8fafc;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
  background: rgba(15, 23, 42, 0.65);
  border: 1px dashed rgba(255, 255, 255, 0.4);
  border-radius: 4px;
  padding: 4px 6px;
  margin-top: 4px;
}
.sk-glass-lock-icon {
  font-size: 11px;
}

/* Bottom Finger Lift Lip */
.sk-glass-lip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  background: rgba(234, 179, 8, 0.2);
  border: 1px solid rgba(234, 179, 8, 0.5);
  border-radius: 4px;
  padding: 3px 6px;
}
.sk-lip-grip {
  width: 24px;
  height: 3px;
  background: repeating-linear-gradient(90deg, #facc15 0 2px, transparent 2px 4px);
  border-radius: 1px;
}
.sk-lip-text {
  font: 700 8.5px ui-monospace, Menlo, monospace;
  color: #fef08a;
  letter-spacing: 0.06em;
}

/* State: OPEN / LIFTED */
.sk-glass-guard.is-open {
  transform: rotateX(115deg) translateY(-8px);
  box-shadow: 0 -14px 28px rgba(0, 0, 0, 0.85), 0 0 20px rgba(14, 165, 233, 0.4);
  pointer-events: auto;
}

/* State: CLOSED */
.sk-glass-guard.is-closed {
  transform: rotateX(0deg);
}
.sk-glass-guard.is-closed:hover .sk-glass-panel {
  border-color: rgba(255, 255, 255, 0.8);
  box-shadow: inset 0 1px 3px rgba(255, 255, 255, 0.95), 0 8px 26px rgba(0, 0, 0, 0.65);
}

.sk-guard {
  border: 1px solid rgba(234, 179, 8, 0.4);
  background: rgba(234, 179, 8, 0.12);
  color: #facc15;
  border-radius: 6px;
  padding: 8px 10px;
  font: 700 11.5px ui-monospace, Menlo, monospace;
  cursor: pointer;
  transition: all 0.12s;
}
.sk-guard:hover:not(:disabled) {
  background: rgba(234, 179, 8, 0.25);
  border-color: #facc15;
}
.sk-guard:disabled {
  cursor: default;
  color: #64748b;
  border-color: #1e293b;
  background: transparent;
}
.sk-center-note {
  margin: 0;
  font-size: 11.5px;
  color: #94a3b8;
  text-align: center;
  max-width: 210px;
  line-height: 1.4;
  font-weight: 500;
}

.sk-pane.is-shaking {
  animation: sk-shake 0.5s;
}
@keyframes sk-shake {
  20% { transform: translate(-6px, 2px); }
  40% { transform: translate(6px, -3px); }
  60% { transform: translate(-4px, 1px); }
  80% { transform: translate(3px, -1px); }
}

.sk-verdict {
  margin-top: 18px;
  background: linear-gradient(135deg, rgba(6, 78, 59, 0.95) 0%, rgba(4, 120, 87, 0.85) 100%);
  color: #ecfdf5;
  border: 2px solid #10b981;
  border-radius: 12px;
  padding: 16px 20px;
  animation: sk-rise 0.5s cubic-bezier(0.2, 1.2, 0.4, 1) both;
  box-shadow: 0 14px 30px rgba(16, 185, 129, 0.35);
}
.sk-verdict strong {
  display: block;
  font-size: 18px;
  line-height: 1.3;
  margin-bottom: 6px;
  color: #ffffff;
  font-weight: 900;
}
.sk-verdict span {
  display: block;
  font: 12px/1.5 ui-monospace, Menlo, monospace;
  color: #a7f3d0;
}
@keyframes sk-rise {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .sk-pane.is-shaking,
  .sk-console.is-open .sk-kill,
  .sk-stamp,
  .sk-verdict {
    animation: none !important;
  }
  .sk-root * {
    transition: none !important;
  }
}
`;
