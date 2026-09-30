import type { IntentPoint, LeaseClaim, Pose, RobotState, TaskPhase, Velocity } from './contracts';

/* ------------------------------------------------------------------ */
/* Topological roadmap                                                 */
/* ------------------------------------------------------------------ */

export type RoadmapNodeType = 'intersection' | 'pick' | 'drop' | 'spur' | 'charging';

export interface RoadmapNode {
  id: string;
  /** World coordinates in metres. */
  x: number;
  y: number;
  type: RoadmapNodeType;
  label: string;
}

export interface RoadmapEdge {
  id: string;
  fromNode: string;
  toNode: string;
  /** Length in metres. */
  length: number;
  /** Speed limit in m/s. */
  speedLimit: number;
  /** Narrow aisles hold one robot at a time and need an exclusive lease. */
  isNarrowAisle: boolean;
  isBlocked: boolean;
}

export interface RoadmapGraph {
  nodes: RoadmapNode[];
  edges: RoadmapEdge[];
  /** Warehouse footprint in metres. */
  widthM: number;
  heightM: number;
}

/* ------------------------------------------------------------------ */
/* AMR physics and agent state                                         */
/* ------------------------------------------------------------------ */

export interface AmrPhysicalParams {
  maxSpeedMps: number;
  maxAccelMps2: number;
  maxDecelMps2: number;
  /** Footprint radius used for separation and collision checks. */
  radiusM: number;
  lengthM: number;
  widthM: number;
  batteryCapacityWh: number;
  /** Energy drawn per metre travelled when loaded. */
  drainWhPerM: number;
}

export interface BatteryState {
  /** State of charge, 0–100. */
  percent: number;
  voltage: number;
  isCharging: boolean;
}

export interface ActiveTask {
  taskId: string;
  phase: TaskPhase;
  pickupNodeId: string;
  dropoffNodeId: string;
  priority: number;
  assignedAtS: number;
}

export interface AmrAgent {
  id: string;
  pose: Pose;
  velocity: Velocity;
  physicalParams: AmrPhysicalParams;
  battery: BatteryState;
  state: RobotState;
  currentEdge: string | null;
  nextNode: string | null;
  intentHorizon: IntentPoint[];
  activeTask: ActiveTask | null;
  currentLease: LeaseClaim | null;
  /** True when the agent has stopped publishing beats (killed or partitioned). */
  isSilent: boolean;
  /** Seconds since the last beat was received from this agent. */
  pingAge: number;
  cpuPercent: number;
  memoryMb: number;
}

/* ------------------------------------------------------------------ */
/* Metrics                                                             */
/* ------------------------------------------------------------------ */

export interface SimulationMetrics {
  collisions: number;
  /** Smallest centre-to-centre gap observed between any two robots, in metres. */
  minSeparationM: number;
  nearMisses: number;
  totalTasksDelivered: number;
  /** Time from a fault to the affected task being re-awarded, in seconds. */
  reAuctionLatencyS: number;
  makespanS: number;
  /**
   * The observer is read-only and never publishes to the bus, so this is
   * fixed at 0. Typing it as the literal 0 lets the compiler enforce that.
   */
  observerPublishedCount: 0;
}
