import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeatmapOverlay from './HeatmapOverlay';
import { STATUS_COLOR } from './types';
import type { AmrView, MapNode, Viewport, WorldView } from './types';

export interface WarehouseCanvasProps {
  world: WorldView;
  showHeatmap?: boolean;
  selectedRobotId?: string | null;
  onSelectRobot?: (id: string | null) => void;
  style?: React.CSSProperties;
  className?: string;
}

const BG = '#080d14';
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 120;
const NODE_R = 0.85;
const BODY_L = 1.1;
const BODY_W = 0.75;

/* ------------------------------ helpers ------------------------------ */

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/* ------------------------------ drawing ------------------------------ */

function drawFloorAndGrid(ctx: CanvasRenderingContext2D, W: number, H: number, zoom: number) {
  ctx.fillStyle = '#080d14';
  ctx.fillRect(0, 0, W, H);

  const drawLines = (step: number, color: string) => {
    ctx.beginPath();
    for (let x = 0; x <= W + 1e-6; x += step) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
    }
    for (let y = 0; y <= H + 1e-6; y += step) {
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();
  };
  if (zoom > 28) drawLines(1, 'rgba(20, 36, 56, 0.4)');
  drawLines(5, 'rgba(30, 52, 80, 0.65)');

  ctx.strokeStyle = 'rgba(14, 165, 233, 0.45)';
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeRect(0, 0, W, H);
}

function drawEdges(ctx: CanvasRenderingContext2D, world: WorldView, nodeMap: Map<string, MapNode>) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const pass = (color: (w: number) => number, style: string, dash?: number[]) => {
    for (const e of world.edges) {
      const a = nodeMap.get(e.from);
      const b = nodeMap.get(e.to);
      if (!a || !b) continue;
      const w = e.widthM ?? 2.2;
      ctx.beginPath();
      ctx.moveTo(a.pos.x, a.pos.y);
      ctx.lineTo(b.pos.x, b.pos.y);
      ctx.strokeStyle = style;
      ctx.lineWidth = color(w);
      ctx.setLineDash(dash ?? []);
      ctx.stroke();
    }
  };
  // Cyber dark track base with luminous guide rails
  pass((w) => w, 'rgba(15, 24, 38, 0.9)');
  pass((w) => w - 0.2, '#0c1524');
  pass((w) => w - 0.6, '#080e1a');
  // Luminous cyan guidance track
  pass(() => 0.12, 'rgba(14, 165, 233, 0.7)', [0.5, 0.35]);
  ctx.setLineDash([]);
}

function drawNodes(ctx: CanvasRenderingContext2D, world: WorldView, t: number) {
  const leased = new Set(world.leasedNodeIds);
  const contended = new Set(world.contendedNodeIds);
  const pulse = (Math.sin(t / 280) + 1) / 2;

  for (const n of world.nodes) {
    const { x, y } = n.pos;
    // Cyber junction socket pad
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = '#0c1524';
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 48, 72, 0.9)';
    ctx.lineWidth = 0.06;
    ctx.stroke();

    // Inner optical socket
    ctx.beginPath();
    ctx.arc(x, y, NODE_R * 0.6, 0, Math.PI * 2);
    ctx.fillStyle = '#080d16';
    ctx.fill();

    if (n.kind === 'charge' || n.kind === 'pick' || n.kind === 'drop') {
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * 0.4, 0, Math.PI * 2);
      ctx.strokeStyle = n.kind === 'charge' ? '#0ea5e9' : n.kind === 'pick' ? '#10b981' : '#f59e0b';
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }

    if (leased.has(n.id)) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, NODE_R * 2.2);
      glow.addColorStop(0, 'rgba(16,185,129,0.4)');
      glow.addColorStop(1, 'rgba(16,185,129,0)');
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * 2.2, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 0.12;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 0.22, 0, Math.PI * 2);
      ctx.fillStyle = '#34d399';
      ctx.fill();
    }

    if (contended.has(n.id)) {
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * (1.15 + 0.55 * pulse), 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(245,158,11,${(0.95 - 0.65 * pulse).toFixed(3)})`;
      ctx.lineWidth = 0.15;
      ctx.stroke();
    }
  }
}

function drawSilentRing(ctx: CanvasRenderingContext2D, r: AmrView, nominal: number, t: number) {
  const silence = r.silentForS ?? 1;
  const radius = clamp(BODY_L * 0.9 + silence * Math.max(nominal, 0.5), 1, 7);
  ctx.beginPath();
  ctx.arc(r.pos.x, r.pos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(225,29,72,0.07)';
  ctx.fill();
  ctx.setLineDash([0.5, 0.35]);
  ctx.lineDashOffset = -t / 220;
  ctx.strokeStyle = 'rgba(225,29,72,0.75)';
  ctx.lineWidth = 0.1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

function drawIntent(ctx: CanvasRenderingContext2D, r: AmrView, color: string) {
  const pts =
    r.intent && r.intent.length > 0
      ? r.intent.slice(0, 3)
      : [1, 2, 3].map((s) => ({
          x: r.pos.x + Math.cos(r.heading) * r.speed * s,
          y: r.pos.y + Math.sin(r.heading) * r.speed * s,
        }));
  const last = pts[pts.length - 1];
  if (Math.hypot(last.x - r.pos.x, last.y - r.pos.y) < 0.05) return;

  const path = () => {
    ctx.beginPath();
    ctx.moveTo(r.pos.x, r.pos.y);
    for (const p of pts) ctx.lineTo(p.x, p.y);
  };
  const grad = ctx.createLinearGradient(r.pos.x, r.pos.y, last.x, last.y);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,255,255,0)');

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = 0.18;
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.9;
  ctx.stroke();
  ctx.globalAlpha = 0.6;
  path();
  ctx.strokeStyle = grad;
  ctx.lineWidth = 0.28;
  ctx.stroke();
  ctx.globalAlpha = 1;

  pts.forEach((p, i) => {
    ctx.globalAlpha = 0.95 - i * 0.25;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 0.16 - i * 0.02, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function drawRobotBody(ctx: CanvasRenderingContext2D, r: AmrView, color: string, selected: boolean, t: number) {
  const BL = BODY_L * 1.3;  // chassis length
  const BW = BODY_W * 1.2;  // chassis width
  const WR = BW * 0.14;     // wheel radius

  ctx.save();
  ctx.translate(r.pos.x, r.pos.y);
  ctx.rotate(r.heading);

  /* ── 1. Wide headlight beam fan ── */
  const coneGrad = ctx.createRadialGradient(BL * 0.4, 0, 0.1, BL * 0.4 + 3.2, 0, 3.0);
  coneGrad.addColorStop(0, `${color}55`);
  coneGrad.addColorStop(1, `${color}00`);
  ctx.beginPath();
  ctx.moveTo(BL * 0.5, -0.12);
  ctx.lineTo(BL * 0.5 + 3.2, -1.05);
  ctx.lineTo(BL * 0.5 + 3.2,  1.05);
  ctx.lineTo(BL * 0.5,  0.12);
  ctx.closePath();
  ctx.fillStyle = coneGrad;
  ctx.fill();

  /* ── 2. Floor underglow halo ── */
  const pulseScale = 1 + 0.08 * Math.sin(t / 350);
  const underglow = ctx.createRadialGradient(0, 0, 0, 0, 0, BL * 0.72 * pulseScale);
  underglow.addColorStop(0,   `${color}55`);
  underglow.addColorStop(0.55, `${color}22`);
  underglow.addColorStop(1,   `${color}00`);
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.ellipse(0, 0, BL * 0.72 * pulseScale, BW * 0.72 * pulseScale, 0, 0, Math.PI * 2);
  ctx.fillStyle = underglow;
  ctx.fill();
  ctx.globalAlpha = 1;

  /* ── 3. Wheel arcs (4 corners) ── */
  const wheelXY: [number, number][] = [
    [BL * 0.38,  BW * 0.52],
    [BL * 0.38, -BW * 0.52],
    [-BL * 0.38,  BW * 0.52],
    [-BL * 0.38, -BW * 0.52],
  ];
  ctx.fillStyle = '#020617';
  ctx.strokeStyle = `${color}99`;
  ctx.lineWidth = 0.04;
  for (const [wx, wy] of wheelXY) {
    ctx.beginPath();
    ctx.ellipse(wx, wy, WR * 1.1, WR * 0.7, Math.PI / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // wheel tread lines
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(Math.PI / 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 0.025;
    for (let ti = -2; ti <= 2; ti++) {
      const ty = ti * WR * 0.28;
      ctx.beginPath();
      ctx.moveTo(-WR * 1.0, ty);
      ctx.lineTo( WR * 1.0, ty);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ── 4. Tapered hexagonal chassis ── */
  const hx = BL * 0.5;
  const hw = BW * 0.5;
  const notch = BL * 0.12;  // front/rear bevel depth
  ctx.beginPath();
  ctx.moveTo( hx - notch,  hw);
  ctx.lineTo( hx,           0);
  ctx.lineTo( hx - notch, -hw);
  ctx.lineTo(-hx + notch, -hw);
  ctx.lineTo(-hx,          0);
  ctx.lineTo(-hx + notch,  hw);
  ctx.closePath();
  const chassisGrad = ctx.createLinearGradient(0, -hw, 0, hw);
  chassisGrad.addColorStop(0,   '#243045');
  chassisGrad.addColorStop(0.5, '#141e2e');
  chassisGrad.addColorStop(1,   '#0d1626');
  ctx.fillStyle = chassisGrad;
  ctx.fill();
  // outer glow border
  ctx.strokeStyle = selected ? color : `${color}80`;
  ctx.lineWidth   = selected ? 0.075 : 0.04;
  ctx.stroke();

  /* ── 5. Interior chassis panel detailing ── */
  // inner inset plate
  ctx.beginPath();
  const ip = 0.12;
  ctx.moveTo( hx - notch - ip,  hw - ip);
  ctx.lineTo( hx - ip,          0);
  ctx.lineTo( hx - notch - ip, -hw + ip);
  ctx.lineTo(-hx + notch + ip, -hw + ip);
  ctx.lineTo(-hx + ip,          0);
  ctx.lineTo(-hx + notch + ip,  hw - ip);
  ctx.closePath();
  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 0.025;
  ctx.stroke();

  // Circuit-board score lines
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 0.018;
  ctx.setLineDash([0.18, 0.14]);
  ctx.beginPath(); ctx.moveTo(-BL * 0.18, -hw + 0.18); ctx.lineTo(-BL * 0.18, hw - 0.18); ctx.stroke();
  ctx.beginPath(); ctx.moveTo( BL * 0.18, -hw + 0.18); ctx.lineTo( BL * 0.18, hw - 0.18); ctx.stroke();
  ctx.setLineDash([]);

  /* ── 6. Full-length LED side strips ── */
  const ledAlpha = 0.85 + 0.15 * Math.sin(t / 200);
  const lsY = hw - 0.08;
  const lsX0 = -BL * 0.3;
  const lsX1 =  BL * 0.38;
  // top strip
  const ledGradTop = ctx.createLinearGradient(lsX0, 0, lsX1, 0);
  ledGradTop.addColorStop(0,   `${color}00`);
  ledGradTop.addColorStop(0.2, color);
  ledGradTop.addColorStop(0.8, color);
  ledGradTop.addColorStop(1,   `${color}00`);
  ctx.globalAlpha = ledAlpha;
  ctx.strokeStyle = ledGradTop;
  ctx.lineWidth = 0.055;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(lsX0, lsY);   ctx.lineTo(lsX1, lsY);   ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lsX0, -lsY);  ctx.lineTo(lsX1, -lsY);  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';

  /* ── 7. Payload cargo crate ── */
  if (r.carrying) {
    const cs = BW * 0.38;
    ctx.save();
    ctx.translate(-BL * 0.05, 0);
    // crate body
    rrect(ctx, -cs * 0.5, -cs * 0.5, cs, cs, 0.07);
    const crateGrad = ctx.createLinearGradient(-cs * 0.5, -cs * 0.5, cs * 0.5, cs * 0.5);
    crateGrad.addColorStop(0, '#0369a1');
    crateGrad.addColorStop(1, '#0c4a6e');
    ctx.fillStyle = crateGrad;
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 0.05;
    ctx.stroke();
    // cross hatch
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.moveTo(-cs * 0.5, 0); ctx.lineTo(cs * 0.5, 0);
    ctx.moveTo(0, -cs * 0.5); ctx.lineTo(0, cs * 0.5);
    ctx.stroke();
    // barcode label
    ctx.fillStyle = '#ffffff';
    rrect(ctx, -cs * 0.22, -cs * 0.14, cs * 0.44, cs * 0.28, 0.03);
    ctx.fill();
    ctx.restore();
  }

  /* ── 8. Dual headlights (bright yellow capsules) ── */
  const hlt = (hy: number) => {
    const hg = ctx.createRadialGradient(hx - 0.04, hy, 0, hx - 0.04, hy, 0.28);
    hg.addColorStop(0, '#fef9c3');
    hg.addColorStop(1, 'rgba(254,241,90,0)');
    ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.arc(hx - 0.04, hy, 0.28, 0, Math.PI * 2);
    ctx.fillStyle = hg; ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(hx - 0.04, hy, 0.07, 0, Math.PI * 2);
    ctx.fillStyle = '#fef08a'; ctx.fill();
  };
  hlt( BW * 0.32);
  hlt(-BW * 0.32);

  /* ── 9. Rear brake lights ── */
  ctx.fillStyle = (r.status === 'FAULTED' || r.status === 'DEADLOCK') ? '#f59e0b' : '#ef4444';
  ctx.globalAlpha = 0.9;
  rrect(ctx, -hx + 0.03, -BW * 0.3, 0.07, BW * 0.6, 0.03);
  ctx.fill();
  ctx.globalAlpha = 1;

  /* ── 10. Central LiDAR dome ── */
  const lidarAngle = (t / 160) % (Math.PI * 2);
  // LiDAR scan beam: draw a wedge arc to simulate sweep
  const sweepSpan = Math.PI * 0.18;
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, BW * 0.28, lidarAngle, lidarAngle + sweepSpan);
  ctx.closePath();
  const sweepGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, BW * 0.28);
  sweepGrad.addColorStop(0, color);
  sweepGrad.addColorStop(1, `${color}00`);
  ctx.fillStyle = sweepGrad;
  ctx.fill();
  ctx.globalAlpha = 1;
  // static scan dot on edge
  const sdx = Math.cos(lidarAngle) * BW * 0.24;
  const sdy = Math.sin(lidarAngle) * BW * 0.24;
  const dotGlow = ctx.createRadialGradient(sdx, sdy, 0, sdx, sdy, 0.18);
  dotGlow.addColorStop(0, color);
  dotGlow.addColorStop(1, `${color}00`);
  ctx.beginPath(); ctx.arc(sdx, sdy, 0.18, 0, Math.PI * 2);
  ctx.fillStyle = dotGlow; ctx.fill();

  // dome housing
  const domeGrad = ctx.createRadialGradient(-0.04, -0.04, 0, 0, 0, BW * 0.2);
  domeGrad.addColorStop(0,   '#253550');
  domeGrad.addColorStop(0.6, '#0e1929');
  domeGrad.addColorStop(1,   '#060d17');
  ctx.beginPath(); ctx.arc(0, 0, BW * 0.2, 0, Math.PI * 2);
  ctx.fillStyle = domeGrad; ctx.fill();
  ctx.strokeStyle = `${color}cc`;
  ctx.lineWidth = 0.045;
  ctx.stroke();
  // inner rings
  ctx.strokeStyle = `${color}55`;
  ctx.lineWidth = 0.022;
  ctx.beginPath(); ctx.arc(0, 0, BW * 0.13, 0, Math.PI * 2); ctx.stroke();
  // center emitter
  const centerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.09);
  centerGlow.addColorStop(0, '#ffffff');
  centerGlow.addColorStop(0.5, color);
  centerGlow.addColorStop(1, `${color}00`);
  ctx.beginPath(); ctx.arc(0, 0, 0.09, 0, Math.PI * 2);
  ctx.fillStyle = centerGlow; ctx.fill();

  /* ── 11. Selection pulse ring ── */
  if (selected) {
    const selPulse = 0.8 + 0.22 * Math.sin(t / 180);
    ctx.beginPath();
    ctx.arc(0, 0, BL * 0.62 * selPulse, 0, Math.PI * 2);
    ctx.strokeStyle = `${color}cc`;
    ctx.lineWidth = 0.07;
    ctx.setLineDash([0.3, 0.18]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawLabels(ctx: CanvasRenderingContext2D, robots: AmrView[], vp: Viewport, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.textBaseline = 'middle';
  for (const r of robots) {
    const sc = STATUS_COLOR[r.status];
    const sx = r.pos.x * vp.zoom + vp.panX;
    const sy = r.pos.y * vp.zoom + vp.panY - (BODY_W * 1.2 / 2 + 0.85) * vp.zoom - 8;

    // Status dot + ID  + status chip
    const label = r.id;
    ctx.font = '800 11px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    const bw = tw + 28;
    const bh = 20;

    // pill shadow
    ctx.shadowColor = sc;
    ctx.shadowBlur = 8;
    rrect(ctx, sx - bw / 2, sy - bh / 2, bw, bh, 10);
    ctx.fillStyle = '#080e1a';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `${sc}99`;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // status dot
    ctx.beginPath();
    ctx.arc(sx - bw / 2 + 11, sy + 0.5, 4, 0, Math.PI * 2);
    ctx.fillStyle = sc;
    ctx.fill();

    // label text
    ctx.fillStyle = '#e2eaf5';
    ctx.textAlign = 'left';
    ctx.fillText(label, sx - bw / 2 + 20, sy + 0.5);
  }
}

/* ------------------------------ component ------------------------------ */

const WarehouseCanvas: React.FC<WarehouseCanvasProps> = ({
  world,
  showHeatmap = false,
  selectedRobotId = null,
  onSelectRobot,
  style,
  className,
}) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [vp, setVpState] = useState<Viewport>({ zoom: 10, panX: 20, panY: 20 });

  const vpRef = useRef(vp);
  const worldRef = useRef(world);
  const selRef = useRef(selectedRobotId);
  worldRef.current = world;
  selRef.current = selectedRobotId;

  const nodeMap = useMemo(() => new Map(world.nodes.map((n) => [n.id, n])), [world.nodes]);
  const nodeMapRef = useRef(nodeMap);
  nodeMapRef.current = nodeMap;

  const setVp = useCallback((next: Viewport) => {
    vpRef.current = next;
    setVpState(next);
  }, []);

  const userInteractedRef = useRef(false);

  const fit = useCallback(() => {
    const pad = 24;
    const currentW = size.w;
    const currentH = size.h;
    if (currentW <= pad * 2 || currentH <= pad * 2) return;
    const z = clamp(
      Math.min((currentW - pad * 2) / world.widthM, (currentH - pad * 2) / world.heightM),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setVp({
      zoom: z,
      panX: (currentW - world.widthM * z) / 2,
      panY: (currentH - world.heightM * z) / 2,
    });
  }, [size.w, size.h, world.widthM, world.heightM, setVp]);

  // Resize handling
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      const nw = Math.max(1, Math.floor(cr.width));
      const nh = Math.max(1, Math.floor(cr.height));
      setSize((prev) => {
        if (prev.w === nw && prev.h === nh) return prev;
        return { w: nw, h: nh };
      });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Backing store size (DPR aware)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(size.w * dpr);
    c.height = Math.floor(size.h * dpr);
  }, [size]);

  // Auto-fit to screen by default (on mount, on measured resize, or world dimension change)
  useEffect(() => {
    if (size.w > 100 && size.h > 100 && !userInteractedRef.current) {
      fit();
    }
  }, [size.w, size.h, world.widthM, world.heightM, fit]);

  // Render loop
  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const dpr = window.devicePixelRatio || 1;
        const w = worldRef.current;
        const v = vpRef.current;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(dpr * v.zoom, 0, 0, dpr * v.zoom, dpr * v.panX, dpr * v.panY);

        drawFloorAndGrid(ctx, w.widthM, w.heightM, v.zoom);
        drawEdges(ctx, w, nodeMapRef.current);
        drawNodes(ctx, w, t);

        for (const r of w.robots) {
          const color = STATUS_COLOR[r.status];
          if (!r.connected || r.packetLost) drawSilentRing(ctx, r, w.nominalSpeed, t);
          drawIntent(ctx, r, color);
        }
        for (const r of w.robots) drawRobotBody(ctx, r, STATUS_COLOR[r.status], r.id === selRef.current, t);

        drawLabels(ctx, w.robots, v, dpr);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      userInteractedRef.current = true;
      const rect = c.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const v = vpRef.current;
      const z = clamp(v.zoom * Math.exp(-e.deltaY * 0.0015), MIN_ZOOM, MAX_ZOOM);
      const k = z / v.zoom;
      setVp({ zoom: z, panX: mx - (mx - v.panX) * k, panY: my - (my - v.panY) * k });
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [setVp]);

  // Drag pan + click select
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const v = vpRef.current;
    drag.current = { x: e.clientX, y: e.clientY, px: v.panX, py: v.panY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    userInteractedRef.current = true;
    setVp({ ...vpRef.current, panX: d.px + dx, panY: d.py + dy });
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved || !onSelectRobot) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const v = vpRef.current;
    const wx = (e.clientX - rect.left - v.panX) / v.zoom;
    const wy = (e.clientY - rect.top - v.panY) / v.zoom;
    let best: string | null = null;
    let bestD = 0.9;
    for (const r of worldRef.current.robots) {
      const dist = Math.hypot(r.pos.x - wx, r.pos.y - wy);
      if (dist < bestD) {
        bestD = dist;
        best = r.id;
      }
    }
    onSelectRobot(best);
  };

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 320,
        overflow: 'hidden',
        background: BG,
        borderRadius: 20,
        boxShadow: 'inset 4px 4px 10px rgba(120,95,50,0.18), inset -4px -4px 10px rgba(255,255,255,0.8)',
        ...style,
      }}
    >
      <HeatmapOverlay
        robots={world.robots}
        tick={world.tick}
        worldW={world.widthM}
        worldH={world.heightM}
        width={size.w}
        height={size.h}
        viewport={vp}
        nominalSpeed={world.nominalSpeed}
        visible={showHeatmap}
      />
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: size.w,
          height: size.h,
          zIndex: 2,
          touchAction: 'none',
          cursor: drag.current?.moved ? 'grabbing' : 'grab',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (drag.current = null)}
      />
      <button
        type="button"
        className="shiny-dark-button"
        onClick={() => {
          userInteractedRef.current = false;
          fit();
        }}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 3,
          padding: '7px 15px',
          borderRadius: 999,
          fontSize: '11px',
        }}
      >
        FIT · {Math.round(vp.zoom * 10) / 10} px/m
      </button>
    </div>
  );
};

export default WarehouseCanvas;
