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

const BG = '#f5f3ec';
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
  ctx.fillStyle = 'rgba(255,253,246,0.55)';
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
  if (zoom > 28) drawLines(1, 'rgba(120,100,60,0.05)');
  drawLines(5, 'rgba(120,100,60,0.11)');

  ctx.strokeStyle = 'rgba(120,100,60,0.4)';
  ctx.lineWidth = 2 / zoom;
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
  // recessed stone track: dark rim, lighter inner bed (semi-transparent so heatmap shows through)
  pass((w) => w, 'rgba(110,88,50,0.28)');
  pass((w) => w - 0.16, 'rgba(226,220,200,0.82)');
  pass((w) => w - 0.5, 'rgba(236,231,214,0.65)');
  // dashed centre line
  pass(() => 0.07, 'rgba(120,100,60,0.5)', [0.45, 0.4]);
  ctx.setLineDash([]);
}

function drawNodes(ctx: CanvasRenderingContext2D, world: WorldView, t: number) {
  const leased = new Set(world.leasedNodeIds);
  const contended = new Set(world.contendedNodeIds);
  const pulse = (Math.sin(t / 280) + 1) / 2;

  for (const n of world.nodes) {
    const { x, y } = n.pos;
    // neumorphic pad: dark shadow (bottom-right), light highlight (top-left), face
    ctx.beginPath();
    ctx.arc(x + 0.09, y + 0.09, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(120,95,50,0.32)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 0.09, y - 0.09, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,253,246,0.95)';
    ctx.fill();
    const face = ctx.createRadialGradient(x - 0.25, y - 0.25, 0.05, x, y, NODE_R);
    face.addColorStop(0, '#faf7ee');
    face.addColorStop(1, '#e6e0cd');
    ctx.beginPath();
    ctx.arc(x, y, NODE_R, 0, Math.PI * 2);
    ctx.fillStyle = face;
    ctx.fill();

    if (n.kind === 'charge' || n.kind === 'pick' || n.kind === 'drop') {
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * 0.4, 0, Math.PI * 2);
      ctx.strokeStyle = n.kind === 'charge' ? '#0ea5e9' : 'rgba(120,100,60,0.55)';
      ctx.lineWidth = 0.08;
      ctx.stroke();
    }

    if (leased.has(n.id)) {
      const glow = ctx.createRadialGradient(x, y, 0, x, y, NODE_R * 2.1);
      glow.addColorStop(0, 'rgba(214,158,46,0.5)');
      glow.addColorStop(1, 'rgba(214,158,46,0)');
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * 2.1, 0, Math.PI * 2);
      ctx.fillStyle = glow;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, NODE_R * 0.95, 0, Math.PI * 2);
      ctx.strokeStyle = '#b7791f';
      ctx.lineWidth = 0.12;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#d69e2e';
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

function drawRobotBody(ctx: CanvasRenderingContext2D, r: AmrView, color: string, selected: boolean) {
  ctx.save();
  ctx.translate(r.pos.x, r.pos.y);
  ctx.rotate(r.heading);

  // soft ground shadow
  rrect(ctx, -BODY_L / 2 + 0.07, -BODY_W / 2 + 0.09, BODY_L, BODY_W, 0.2);
  ctx.fillStyle = 'rgba(60,45,20,0.25)';
  ctx.fill();

  // chassis
  const g = ctx.createLinearGradient(0, -BODY_W / 2, 0, BODY_W / 2);
  g.addColorStop(0, '#4d4a43');
  g.addColorStop(1, '#2c2a26');
  rrect(ctx, -BODY_L / 2, -BODY_W / 2, BODY_L, BODY_W, 0.2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = selected ? '#d69e2e' : 'rgba(255,250,235,0.35)';
  ctx.lineWidth = selected ? 0.1 : 0.04;
  ctx.stroke();

  // payload crate
  if (r.carrying) {
    rrect(ctx, -0.27, -0.27, 0.54, 0.54, 0.05);
    ctx.fillStyle = '#c08a4b';
    ctx.fill();
    ctx.strokeStyle = '#7a531f';
    ctx.lineWidth = 0.04;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.27, 0);
    ctx.lineTo(0.27, 0);
    ctx.moveTo(0, -0.27);
    ctx.lineTo(0, 0.27);
    ctx.strokeStyle = 'rgba(122,83,31,0.6)';
    ctx.stroke();
  }

  // direction arrow at the nose
  ctx.beginPath();
  ctx.moveTo(BODY_L / 2 - 0.02, 0);
  ctx.lineTo(BODY_L / 2 - 0.3, -0.17);
  ctx.lineTo(BODY_L / 2 - 0.3, 0.17);
  ctx.closePath();
  ctx.fillStyle = '#f5f0dc';
  ctx.fill();

  // status LED pip with glow
  const lx = -BODY_L / 2 + 0.17;
  const ly = -BODY_W / 2 + 0.16;
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, 0.3);
  glow.addColorStop(0, color);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(lx, ly, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(lx, ly, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.restore();
}

function drawLabels(ctx: CanvasRenderingContext2D, robots: AmrView[], vp: Viewport, dpr: number) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // screen space so text stays crisp
  ctx.font = '600 11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of robots) {
    const sx = r.pos.x * vp.zoom + vp.panX;
    const sy = r.pos.y * vp.zoom + vp.panY - (BODY_W / 2 + 0.55) * vp.zoom - 4;
    const w = ctx.measureText(r.id).width + 10;
    rrect(ctx, sx - w / 2, sy - 8, w, 16, 8);
    ctx.fillStyle = 'rgba(38,36,32,0.88)';
    ctx.fill();
    ctx.fillStyle = '#f5f0dc';
    ctx.fillText(r.id, sx, sy + 0.5);
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

  const fit = useCallback(() => {
    const pad = 24;
    const z = clamp(
      Math.min((size.w - pad * 2) / world.widthM, (size.h - pad * 2) / world.heightM),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    setVp({
      zoom: z,
      panX: (size.w - world.widthM * z) / 2,
      panY: (size.h - world.heightM * z) / 2,
    });
  }, [size.w, size.h, world.widthM, world.heightM, setVp]);

  // Resize handling
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect;
      setSize({ w: Math.max(1, Math.floor(cr.width)), h: Math.max(1, Math.floor(cr.height)) });
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

  // Fit when world dimensions change (or on first real size)
  const fitKey = `${world.widthM}x${world.heightM}`;
  const fittedKeyRef = useRef('');
  useEffect(() => {
    if (fittedKeyRef.current !== fitKey) {
      fittedKeyRef.current = fitKey;
      fit();
    }
  }, [fitKey, fit]);

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
        for (const r of w.robots) drawRobotBody(ctx, r, STATUS_COLOR[r.status], r.id === selRef.current);

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
        onClick={fit}
        style={{
          position: 'absolute',
          right: 12,
          bottom: 12,
          zIndex: 3,
          padding: '6px 12px',
          borderRadius: 999,
          border: 'none',
          background: '#2b2925',
          color: '#f5f0dc',
          font: '600 11px ui-monospace, monospace',
          cursor: 'pointer',
        }}
      >
        FIT · {Math.round(vp.zoom * 10) / 10} px/m
      </button>
    </div>
  );
};

export default WarehouseCanvas;
