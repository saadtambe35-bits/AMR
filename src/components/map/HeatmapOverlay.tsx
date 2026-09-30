import React, { useEffect, useRef } from 'react';
import type { AmrView, Viewport } from './types';

interface HeatmapOverlayProps {
  robots: AmrView[];
  tick: number;
  worldW: number; // meters
  worldH: number; // meters
  width: number; // css px
  height: number; // css px
  viewport: Viewport;
  nominalSpeed: number;
  visible: boolean;
  cellM?: number; // default 5
}

type RGBA = [number, number, number, number];

// Sandstone clear -> translucent gold -> burning amber -> crimson
const STOPS: Array<[number, RGBA]> = [
  [0.0, [245, 243, 236, 0]],
  [0.35, [230, 190, 80, 0.35]],
  [0.7, [240, 140, 20, 0.55]],
  [1.0, [200, 30, 40, 0.72]],
];

export function heatColor(v: number): string {
  const t = Math.max(0, Math.min(1, v));
  for (let i = 1; i < STOPS.length; i++) {
    const [t1, c1] = STOPS[i];
    if (t <= t1) {
      const [t0, c0] = STOPS[i - 1];
      const k = (t - t0) / (t1 - t0);
      const m = (j: number) => c0[j] + (c1[j] - c0[j]) * k;
      return `rgba(${m(0) | 0},${m(1) | 0},${m(2) | 0},${m(3).toFixed(3)})`;
    }
  }
  return 'rgba(200,30,40,0.72)';
}

const DECAY = 0.985; // per tick, leaves a fading "memory" of choke points
const GAIN = 0.35;

const HeatmapOverlay: React.FC<HeatmapOverlayProps> = ({
  robots,
  tick,
  worldW,
  worldH,
  width,
  height,
  viewport,
  nominalSpeed,
  visible,
  cellM = 5,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<Float32Array>(new Float32Array(0));
  const lastTickRef = useRef(0);
  const robotsRef = useRef(robots);
  robotsRef.current = robots;

  const cols = Math.max(1, Math.ceil(worldW / cellM));
  const rows = Math.max(1, Math.ceil(worldH / cellM));

  // Accumulate speed-below-nominal density per tick
  useEffect(() => {
    if (gridRef.current.length !== cols * rows || tick < lastTickRef.current) {
      gridRef.current = new Float32Array(cols * rows);
    }
    lastTickRef.current = tick;
    const g = gridRef.current;
    for (let i = 0; i < g.length; i++) g[i] *= DECAY;

    for (const r of robotsRef.current) {
      if (r.status === 'CHARGING') continue;
      const cx = Math.floor(r.pos.x / cellM);
      const cy = Math.floor(r.pos.y / cellM);
      if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) continue;
      const ratio = nominalSpeed > 0 ? r.speed / nominalSpeed : 1;
      const stalled = r.status === 'WAITING' || r.status === 'YIELDING' || r.status === 'DEADLOCK';
      const deficit = stalled ? 1 : Math.max(0, 1 - ratio / 0.85);
      if (deficit <= 0) continue;
      const idx = cy * cols + cx;
      g[idx] = Math.min(1, g[idx] + deficit * GAIN);
    }
  }, [tick, cols, rows, cellM, nominalSpeed]);

  // Paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!visible) return;

    ctx.setTransform(dpr * viewport.zoom, 0, 0, dpr * viewport.zoom, dpr * viewport.panX, dpr * viewport.panY);
    const g = gridRef.current;
    const inset = 0.08;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const v = g[cy * cols + cx];
        if (!(v > 0.03)) continue;
        ctx.fillStyle = heatColor(v);
        ctx.fillRect(cx * cellM + inset, cy * cellM + inset, cellM - inset * 2, cellM - inset * 2);
      }
    }
  }, [tick, viewport, width, height, visible, cols, rows, cellM]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width,
        height,
        pointerEvents: 'none',
        zIndex: 1,
      }}
    />
  );
};

export default HeatmapOverlay;
