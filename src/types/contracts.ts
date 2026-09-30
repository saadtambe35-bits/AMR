/**
 * SwarmEdge v2 — wire contracts.
 * Mirrors swarmedge_contracts.proto and the PRD. Every message carries a Header.
 * Times are seconds on the simulation clock unless the field name says otherwise.
 */

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export enum RobotState {
  IDLE = 'IDLE',
  EN_ROUTE = 'EN_ROUTE',
  WAITING_FOR_LEASE = 'WAITING_FOR_LEASE',
  CROSSING = 'CROSSING',
  YIELDING = 'YIELDING',
  BACKING_OFF = 'BACKING_OFF',
  PICKING = 'PICKING',
  DROPPING = 'DROPPING',
  CHARGING = 'CHARGING',
  FAULTED = 'FAULTED',
}

export enum TaskPhase {
  ASSIGNED = 'ASSIGNED',
  TO_PICKUP = 'TO_PICKUP',
  PICKING_UP = 'PICKING_UP',
  TO_DROPOFF = 'TO_DROPOFF',
  DELIVERED = 'DELIVERED',
  ABORTED = 'ABORTED',
}

export enum HazardType {
  BLOCKED_EDGE = 'BLOCKED_EDGE',
  SLOW_ZONE = 'SLOW_ZONE',
  SOS_GEOFENCE = 'SOS_GEOFENCE',
}

export enum ChaosType {
  KILL_ROBOT = 'KILL_ROBOT',
  STALL_ROBOT = 'STALL_ROBOT',
  PARTITION_NETWORK = 'PARTITION_NETWORK',
  PACKET_LOSS = 'PACKET_LOSS',
  LATENCY_SPIKE = 'LATENCY_SPIKE',
  BLOCK_AISLE = 'BLOCK_AISLE',
  ADD_ROBOTS = 'ADD_ROBOTS',
  KILL_COORDINATOR = 'KILL_COORDINATOR',
  BYZANTINE_TELEMETRY = 'BYZANTINE_TELEMETRY',
}

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

export interface Header {
  /** Robot id, coordinator id, or 'chaos-console'. */
  senderId: string;
  /** Monotonic per-sender sequence number; receivers drop stale or duplicate values. */
  seq: number;
  /** Sender's simulation clock at publish time, in seconds. */
  stampS: number;
  /** Coordinator epoch / leadership term the sender believes is current. */
  epoch: number;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface Pose {
  x: number;
  y: number;
  /** Heading in radians, counter-clockwise from +x. */
  theta: number;
}

export interface Velocity {
  /** Forward speed in m/s. */
  linear: number;
  /** Yaw rate in rad/s. */
  angular: number;
}

/** One predicted waypoint of a robot's short-horizon intent. */
export interface IntentPoint {
  /** Seconds from the beat's stamp at which the robot expects to be here. */
  tOffsetS: number;
  position: Point2D;
  edgeId: string;
  /** Set when the point coincides with a roadmap node. */
  nodeId: string | null;
}

/* ------------------------------------------------------------------ */
/* Telemetry & leases                                                  */
/* ------------------------------------------------------------------ */

export interface StateBeat {
  header: Header;
  robotId: string;
  state: RobotState;
  pose: Pose;
  velocity: Velocity;
  /** State of charge, 0–100. */
  batteryPercent: number;
  currentEdgeId: string | null;
  nextNodeId: string | null;
  intent: IntentPoint[];
  activeTaskId: string | null;
  heldLeaseIds: string[];
}

export interface LeaseRequest {
  header: Header;
  robotId: string;
  edgeId: string;
  /** Predicted entry and exit times on the sim clock. */
  entryEtaS: number;
  exitEtaS: number;
  /** Higher wins ties; derived from task priority and time already waited. */
  priority: number;
}

export interface LeaseClaim {
  header: Header;
  leaseId: string;
  robotId: string;
  edgeId: string;
  grantedAtS: number;
  expiresAtS: number;
}

export interface LeaseRelease {
  header: Header;
  leaseId: string;
  robotId: string;
  edgeId: string;
  releasedAtS: number;
}

/* ------------------------------------------------------------------ */
/* Task auction                                                        */
/* ------------------------------------------------------------------ */

export interface TaskAnnounce {
  header: Header;
  taskId: string;
  /** Auction round for this task. Starts at 0; each re-auction adds 1. */
  attempt: number;
  pickupNodeId: string;
  dropoffNodeId: string;
  priority: number;
  deadlineS: number | null;
  /** How long bidders have to respond, in seconds. */
  bidWindowS: number;
}

export interface BidBreakdown {
  travelCost: number;
  batteryPenalty: number;
  congestionPenalty: number;
  queuePenalty: number;
  /** Sum of the components above; lower wins. */
  total: number;
}

export interface TaskCost {
  distanceM: number;
  etaS: number;
  energyWh: number;
  breakdown: BidBreakdown;
}

export interface TaskBid {
  header: Header;
  taskId: string;
  attempt: number;
  robotId: string;
  cost: TaskCost;
}

export interface TaskAward {
  header: Header;
  taskId: string;
  attempt: number;
  winnerId: string;
  winningCost: number;
  /** Losing bidders, best first, kept as fallbacks for re-auction. */
  runnerUpIds: string[];
}

export interface TaskStatus {
  header: Header;
  taskId: string;
  /** Doubles as the task-lease renewal: the owner sends one every second. */
  attempt: number;
  robotId: string;
  phase: TaskPhase;
  /** 0–1 across the whole task. */
  progress: number;
  /** Populated when phase is ABORTED. */
  abortReason: string | null;
}

/* ------------------------------------------------------------------ */
/* Hazards & emergencies                                               */
/* ------------------------------------------------------------------ */

export interface HazardReport {
  header: Header;
  hazardId: string;
  type: HazardType;
  reporterId: string;
  /** Set for BLOCKED_EDGE and SLOW_ZONE. */
  edgeId: string | null;
  /** Set for SOS_GEOFENCE. */
  center: Point2D | null;
  radiusM: number;
  /** Speed multiplier for SLOW_ZONE, 0–1. Null for other types. */
  speedFactor: number | null;
  ttlS: number;
}

export interface HazardDigest {
  header: Header;
  digestSeq: number;
  hazards: HazardReport[];
}

export interface SosBroadcast {
  header: Header;
  robotId: string;
  pose: Pose;
  reason: string;
  geofenceRadiusM: number;
}

/* ------------------------------------------------------------------ */
/* Chaos                                                               */
/* ------------------------------------------------------------------ */

export interface ChaosParams {
  /** KILL_ROBOT, STALL_ROBOT, BYZANTINE_TELEMETRY. */
  targetRobotId?: string;
  /** STALL_ROBOT, PARTITION_NETWORK, LATENCY_SPIKE, BLOCK_AISLE: seconds the fault lasts. */
  durationS?: number;
  /** PACKET_LOSS: drop probability, 0–1. */
  lossProbability?: number;
  /** LATENCY_SPIKE: added one-way delay in milliseconds. */
  addedLatencyMs?: number;
  /** BLOCK_AISLE: edge to block. */
  edgeId?: string;
  /** ADD_ROBOTS: how many robots to spawn. */
  robotCount?: number;
  /** PARTITION_NETWORK: robot ids cut off from the rest of the fleet. */
  partitionRobotIds?: string[];
}

export interface ChaosCommand {
  header: Header;
  chaosType: ChaosType;
  params: ChaosParams;
}
