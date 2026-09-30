/**
 * SwarmEdge v2 — shared cockpit data contracts (Block 4).
 * Everything the cockpit renders is a pure function of these props:
 * the observer subscribes to the mesh, it never publishes to it.
 */

export type RobotState =
  | 'IDLE'
  | 'CRUISING'
  | 'APPROACHING'
  | 'CROSSING'
  | 'YIELDING'
  | 'CHARGING'
  | 'FAULT'
  | 'ISOLATED';

export type LeaseStatus = 'HELD' | 'QUEUED' | 'NONE';

export type MeshState = 'CONVERGED' | 'FORMING' | 'DEGRADED' | 'PARTITIONED';

export interface Point2D {
  x: number;
  y: number;
}

export interface Waypoint extends Point2D {
  node?: string;
}

/** Latest intent broadcast received from the robot (subscribe-only view). */
export interface RobotIntent {
  seq: number;
  fromNode: string;
  toNode: string;
  target: Point2D;
  headingDeg: number;
  etaS: number;
  waypoints: Waypoint[];
}

export interface PeerDistance {
  peerId: string;
  distanceM: number;
  /** Positive = closing, negative = opening. */
  closingSpeedMps: number;
  lastHeardMs: number;
}

export type HazardKind = 'SPILL' | 'BLOCKED_EDGE' | 'OBSTACLE' | 'SLOW_ZONE' | 'PEER_FAULT';

export interface HazardEntry {
  id: string;
  kind: HazardKind;
  location: string;
  ageS: number;
  ttlS: number;
  reportedBy: string;
}

export interface Robot {
  id: string;
  name: string;
  online: boolean;
  state: RobotState;
  batteryPct: number;
  speedMps: number;
  payloadKg: number;
  position: Point2D;
  leaseStatus: LeaseStatus;
  /** Intersection node the robot holds or is queued for. */
  leaseNodeId: string | null;
  wifiIsolated: boolean;
  cpuPct: number;
  intent: RobotIntent | null;
  peers: PeerDistance[];
  hazards: HazardEntry[];
}

/** Bid weights from the lease arbitration spec. */
export const BID_WEIGHTS = { urgency: 1.0, ke: 0.6, age: 0.5 } as const;

export interface BidInputs {
  urgency: number;
  ke: number;
  waitAgeS: number;
}

export interface LeaseClaim {
  robotId: string;
  role: 'HOLDER' | 'QUEUED';
  bid: BidInputs;
}

export interface IntersectionLease {
  nodeId: string;
  label: string;
  /** Remaining lease TTL in ms (holder only). */
  ttlMs: number | null;
  holder: LeaseClaim | null;
  queue: LeaseClaim[];
}

export interface BidBreakdown {
  urgency: number;
  ke: number;
  age: number;
  total: number;
}

/** Bid = 1.0*(U) + 0.6*(KE) + 0.5*(Age) */
export function computeBid(bid: BidInputs): BidBreakdown {
  const urgency = BID_WEIGHTS.urgency * bid.urgency;
  const ke = BID_WEIGHTS.ke * bid.ke;
  const age = BID_WEIGHTS.age * bid.waitAgeS;
  return { urgency, ke, age, total: urgency + ke + age };
}
