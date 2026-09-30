export interface Vec2 {
  x: number;
  y: number;
}

export type AmrStatus =
  | 'EN_ROUTE'
  | 'CROSSING'
  | 'WAITING'
  | 'YIELDING'
  | 'FAULTED'
  | 'DEADLOCK'
  | 'CHARGING';

export interface MapNode {
  id: string;
  pos: Vec2; // meters
  kind?: 'junction' | 'aisle' | 'pick' | 'drop' | 'charge';
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  widthM?: number; // default 2.2
}

export interface AmrView {
  id: string;
  pos: Vec2; // meters
  heading: number; // radians, 0 = +x
  speed: number; // m/s
  status: AmrStatus;
  connected: boolean;
  packetLost?: boolean;
  /** Seconds since last heard from this peer (drives reachable inflation). */
  silentForS?: number;
  carrying: boolean;
  /** Optional planned intent points (next ~3 s). Falls back to straight-line extrapolation. */
  intent?: Vec2[];
}

export interface WorldView {
  widthM: number;
  heightM: number;
  nodes: MapNode[];
  edges: MapEdge[];
  robots: AmrView[];
  leasedNodeIds: string[];
  contendedNodeIds: string[];
  nominalSpeed: number; // m/s
  tick: number; // monotonically increasing sim tick (resets to 0 on sim reset)
}

export interface Viewport {
  zoom: number; // px per meter
  panX: number; // px
  panY: number; // px
}

export const STATUS_COLOR: Record<AmrStatus, string> = {
  EN_ROUTE: '#10b981',
  CROSSING: '#10b981',
  WAITING: '#f59e0b',
  YIELDING: '#f59e0b',
  FAULTED: '#f43f5e',
  DEADLOCK: '#f43f5e',
  CHARGING: '#0ea5e9',
};
