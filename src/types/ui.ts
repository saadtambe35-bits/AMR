import type { HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { RobotState } from './contracts';

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */

export type ActiveTab = 'cockpit' | 'warehouse' | 'duel' | 'chaos' | 'benchmarks' | 'profiler';

export interface TabDescriptor {
  id: ActiveTab;
  label: string;
  icon: LucideIcon;
}

/* ------------------------------------------------------------------ */
/* Theme                                                               */
/* ------------------------------------------------------------------ */

export type LedTone = 'emerald' | 'amber' | 'rose' | 'sky';

export interface LedPalette {
  /** Solid core colour. */
  hex: string;
  /** Comma-separated r, g, b used for translucent glows. */
  rgb: string;
  label: string;
}

export interface ThemeTokens {
  canvas: string;
  textHeading: string;
  textBody: string;
  textCaption: string;
  led: Record<LedTone, LedPalette>;
}

export const SWARM_THEME: ThemeTokens = {
  canvas: '#f5f3ec',
  textHeading: 'text-stone-800',
  textBody: 'text-stone-600',
  textCaption: 'text-stone-400',
  led: {
    emerald: { hex: '#10B981', rgb: '16, 185, 129', label: 'Active' },
    amber: { hex: '#F59E0B', rgb: '245, 158, 11', label: 'Caution' },
    rose: { hex: '#EF4444', rgb: '239, 68, 68', label: 'Danger' },
    sky: { hex: '#0EA5E9', rgb: '14, 165, 233', label: 'Telemetry' },
  },
};

/** Maps each robot state to the LED tone used wherever that state is shown. */
export const ROBOT_STATE_TONE: Record<RobotState, LedTone> = {
  [RobotState.IDLE]: 'sky',
  [RobotState.EN_ROUTE]: 'emerald',
  [RobotState.WAITING_FOR_LEASE]: 'amber',
  [RobotState.CROSSING]: 'emerald',
  [RobotState.YIELDING]: 'amber',
  [RobotState.BACKING_OFF]: 'amber',
  [RobotState.PICKING]: 'sky',
  [RobotState.DROPPING]: 'sky',
  [RobotState.CHARGING]: 'sky',
  [RobotState.FAULTED]: 'rose',
};

/* ------------------------------------------------------------------ */
/* Telemetry display models                                            */
/* ------------------------------------------------------------------ */

export interface RobotTelemetryRow {
  robotId: string;
  state: RobotState;
  batteryPercent: number;
  speedMps: number;
  currentEdgeId: string | null;
  taskId: string | null;
  pingAgeS: number;
  isSilent: boolean;
  cpuPercent: number;
  memoryMb: number;
}

export interface MetricReadout {
  id: string;
  label: string;
  value: string;
  unit: string | null;
  tone: LedTone;
}

/* ------------------------------------------------------------------ */
/* Component props                                                     */
/* ------------------------------------------------------------------ */

export type SurfaceElement = 'div' | 'section' | 'article' | 'aside';
export type SurfacePadding = 'none' | 'sm' | 'md' | 'lg';

export interface SkinGlassCardProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  /** HTML element to render. Defaults to div. */
  as?: SurfaceElement;
  padding?: SurfacePadding;
  /** Adds a lift-on-hover and pointer cursor for clickable cards. */
  interactive?: boolean;
}

export type ChipSize = 'sm' | 'md';

export interface CockpitChipProps extends HTMLAttributes<HTMLSpanElement> {
  children?: ReactNode;
  icon?: LucideIcon;
  /** Shows an LED pip before the label. */
  ledTone?: LedTone;
  size?: ChipSize;
}

export type WellVariant = 'well' | 'meter' | 'input';

export interface RecessedWellProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
  as?: SurfaceElement;
  variant?: WellVariant;
  padding?: SurfacePadding;
}

export interface RecessedProgressProps extends HTMLAttributes<HTMLDivElement> {
  /** 0–100; values outside the range are clamped. */
  value: number;
  tone?: LedTone;
  /** Accessible name for the progress bar. */
  label: string;
}

export interface OpticalLedPipProps extends HTMLAttributes<HTMLSpanElement> {
  tone: LedTone;
  /** Diameter of the lens in px. Defaults to 2. */
  sizePx?: number;
  /** Accessible label; defaults to the tone's meaning. Pass null to hide from assistive tech. */
  label?: string | null;
  /** Turns the breathing halo off. */
  still?: boolean;
}
