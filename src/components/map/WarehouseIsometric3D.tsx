/**
 * WarehouseIsometric3D.tsx
 *
 * Real-time isometric digital twin for an AMR warehouse swarm.
 * Stack: React + three + @react-three/fiber + @react-three/drei + lucide-react.
 *
 * Coordinate mapping
 *   Warehouse (x, y) in metres, origin top-left, y grows "down" the map
 *   -> three.js (X = x - W/2, Y = up, Z = y - H/2). The floor is centred on the origin.
 *
 * Conventions / assumptions (all documented so they are easy to change)
 *   - AmrView.heading: a value with |h| > 2π is read as degrees, otherwise radians.
 *     0 points along +x on the map and angles increase towards +y (atan2(dy, dx)).
 *     If heading is missing, it is derived from the direction of motion.
 *   - AmrView.battery is a percentage (0 to 100). AmrView.speed is in m/s.
 *   - MapEdge.bidirectional === false draws a direction arrow; undefined counts as two-way.
 *   - Objects are drawn at VISUAL_SCALE times their real size so they stay readable
 *     when the whole 80 x 50 m floor is in view. Positions are always true to scale.
 *
 * Interaction
 *   Left-drag / one finger: pan. Right-drag / two fingers: rotate. Wheel / pinch: zoom.
 *   Click a robot to select it, click empty floor or press Escape to clear.
 *   Click a lane to call onSelectEdge.
 */

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { Billboard, Grid, Html, Line, OrbitControls, useCursor } from '@react-three/drei';
import { Bot, LayoutGrid, LocateFixed, Maximize2, Minimize2, Route, Tag, X } from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*  Types contract (remove these and import from your shared module if needed) */
/* -------------------------------------------------------------------------- */

export interface MapNode {
  id: string;
  name: string;
  x: number;
  y: number;
  type?: 'station' | 'waypoint' | 'junction' | 'charger' | 'storage' | 'pick' | 'drop' | 'charge' | 'aisle';
}

export interface MapEdge {
  id: string;
  source: string;
  target: string;
  bidirectional?: boolean;
}

export type AmrStatus = 'IDLE' | 'MOVING' | 'BLOCKED' | 'CHARGING' | 'ERROR' | 'OFFLINE';

export interface AmrView {
  id: string;
  name?: string;
  status: AmrStatus;
  battery: number;
  speed: number;
  x: number;
  y: number;
  heading?: number;
  currentTask?: string;
  path?: Array<{ x: number; y: number }>;
}

export interface WorldView {
  timestamp: number;
  amrs: AmrView[];
  blockedEdges?: string[];
  hazards?: Array<{ id: string; x: number; y: number; radius: number; severity: string; type: string }>;
  nodes?: MapNode[];
  edges?: MapEdge[];
}

export interface WarehouseCanvasProps {
  world: any;
  selectedAmrId?: string | null;
  selectedRobotId?: string | null;
  onSelectAmr?: (id: string | null) => void;
  onSelectRobot?: (id: string | null) => void;
  onSelectEdge?: (edgeId: string) => void;
  width?: number;
  height?: number;
  className?: string;
  style?: React.CSSProperties;
  showHeatmap?: boolean;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

/* -------------------------------------------------------------------------- */
/*  Tuning constants and palette                                               */
/* -------------------------------------------------------------------------- */

const VISUAL_SCALE = 1.6; // robots are drawn larger than life for legibility
const SNAP_DISTANCE = 12; // metres; larger jumps teleport instead of gliding
const POS_LAMBDA = 7; // position smoothing rate (higher = snappier)
const ROT_LAMBDA = 10; // heading smoothing rate
const LANE_WIDTH = 0.55;

const STATUS_ORDER: AmrStatus[] = ['MOVING', 'IDLE', 'CHARGING', 'BLOCKED', 'ERROR', 'OFFLINE'];

const STATUS_COLOR: Record<AmrStatus, string> = {
  IDLE: '#9fb0c0',
  MOVING: '#10b981', // Emerald active
  BLOCKED: '#f59e0b', // Amber alert
  CHARGING: '#0ea5e9', // Sky blue charge
  ERROR: '#ef4444',
  OFFLINE: '#6e675f',
};

const STATUS_LABEL: Record<AmrStatus, string> = {
  IDLE: 'Idle',
  MOVING: 'Moving',
  BLOCKED: 'Blocked',
  CHARGING: 'Charging',
  ERROR: 'Error',
  OFFLINE: 'Offline',
};

const STATUS_THREE: Record<AmrStatus, THREE.Color> = {
  IDLE: new THREE.Color(STATUS_COLOR.IDLE),
  MOVING: new THREE.Color(STATUS_COLOR.MOVING),
  BLOCKED: new THREE.Color(STATUS_COLOR.BLOCKED),
  CHARGING: new THREE.Color(STATUS_COLOR.CHARGING),
  ERROR: new THREE.Color(STATUS_COLOR.ERROR),
  OFFLINE: new THREE.Color(STATUS_COLOR.OFFLINE),
};

const AMBER = '#f59e0b';
const LANE_COLOR = '#fbfaf7'; // Smooth off-white ceramic guide rails
const LANE_BLOCKED = '#ef4444';

/* -------------------------------------------------------------------------- */
/*  Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const DUMMY = new THREE.Object3D();
const TMP_COLOR = new THREE.Color();

const statusColor = (s: AmrStatus) => STATUS_COLOR[s] ?? STATUS_COLOR.IDLE;
const statusThree = (s: AmrStatus) => STATUS_THREE[s] ?? STATUS_THREE.IDLE;
const statusLabel = (s: AmrStatus) => STATUS_LABEL[s] ?? String(s);

const clampPct = (b: number) => (Number.isFinite(b) ? Math.min(100, Math.max(0, b)) : 0);
const batteryColor = (b: number) => (b > 50 ? '#3fb37f' : b > 20 ? '#f2b705' : '#ff4d5e');

const normalizeAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const headingToRadians = (h: number) =>
  Math.abs(h) > Math.PI * 2 + 1e-3 ? THREE.MathUtils.degToRad(h) : h;

function hazardColor(severity: string): string {
  const s = (severity ?? '').toLowerCase();
  if (s.includes('crit') || s.includes('high') || s.includes('sev')) return '#ff4d5e';
  if (s.includes('med') || s.includes('mod')) return '#ff8a2b';
  return '#f2b705';
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduce(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduce;
}

/* -------------------------------------------------------------------------- */
/*  Generic instanced mesh helper                                              */
/* -------------------------------------------------------------------------- */

interface InstItem {
  p: [number, number, number];
  s: [number, number, number];
  ry?: number;
  rz?: number;
}

interface InstancedProps {
  items: InstItem[];
  children: React.ReactNode; // geometry + material
  castShadow?: boolean;
  receiveShadow?: boolean;
  onPick?: (index: number) => void;
  onHover?: (index: number | null) => void;
}

function Instanced({ items, children, castShadow, receiveShadow, onPick, onHover }: InstancedProps) {
  const ref = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    items.forEach((it, i) => {
      DUMMY.position.set(it.p[0], it.p[1], it.p[2]);
      DUMMY.rotation.set(0, it.ry ?? 0, it.rz ?? 0);
      DUMMY.scale.set(it.s[0], it.s[1], it.s[2]);
      DUMMY.updateMatrix();
      mesh.setMatrixAt(i, DUMMY.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  if (items.length === 0) return null;

  const events =
    onPick || onHover
      ? {
          onClick: (e: ThreeEvent<MouseEvent>) => {
            if (!onPick || e.instanceId == null) return;
            e.stopPropagation();
            onPick(e.instanceId);
          },
          onPointerMove: (e: ThreeEvent<PointerEvent>) => {
            if (!onHover || e.instanceId == null) return;
            e.stopPropagation();
            onHover(e.instanceId);
          },
          onPointerOut: () => onHover?.(null),
        }
      : {};

  return (
    <instancedMesh
      // remount when the count changes: InstancedMesh capacity is fixed at construction
      key={items.length}
      ref={ref}
      args={[
        undefined as unknown as THREE.BufferGeometry,
        undefined as unknown as THREE.Material,
        items.length,
      ]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
      frustumCulled={false}
      {...events}
    >
      {children}
    </instancedMesh>
  );
}

/* -------------------------------------------------------------------------- */
/*  Camera rig: isometric framing + reset                                      */
/* -------------------------------------------------------------------------- */

function CameraRig({ W, H, resetToken }: { W: number; H: number; resetToken: number }) {
  const camera = useThree((s) => s.camera) as THREE.OrthographicCamera;
  const size = useThree((s) => s.size);
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const sizeRef = useRef(size);
  sizeRef.current = size;
  const ready = size.width > 0 && size.height > 0;

  // Re-frames on mount, on map size change and on reset. Not on plain resize,
  // so the viewer's own zoom and pan survive window changes.
  useLayoutEffect(() => {
    if (!ready) return;
    const s = sizeRef.current;
    const ext = W + H;
    camera.position.set(1, 1, 1).normalize().multiplyScalar(200);
    camera.up.set(0, 1, 0);
    camera.zoom = Math.max(1, Math.min(s.width / (ext * 0.74 + 10), s.height / (ext * 0.46 + 16)));
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    } else {
      camera.lookAt(0, 0, 0);
    }
  }, [ready, W, H, resetToken, camera, controls]);

  return null;
}

/* -------------------------------------------------------------------------- */
/*  Facility Architecture: Perimeter Walls, Columns, Trusses & Safety Zones   */
/* -------------------------------------------------------------------------- */

function FacilityPerimeter({ W, H }: { W: number; H: number }) {
  const wallH = 1.6;
  const wallT = 0.35;
  const colCountX = 6;
  const colCountZ = 4;

  const cols = useMemo(() => {
    const list: [number, number][] = [];
    const stepX = (W - 2) / (colCountX - 1);
    const stepZ = (H - 2) / (colCountZ - 1);
    for (let i = 0; i < colCountX; i++) {
      const x = -W / 2 + 1 + i * stepX;
      list.push([x, -H / 2 + 0.5], [x, H / 2 - 0.5]);
    }
    for (let j = 1; j < colCountZ - 1; j++) {
      const z = -H / 2 + 1 + j * stepZ;
      list.push([-W / 2 + 0.5, z], [W / 2 - 0.5, z]);
    }
    return list;
  }, [W, H]);

  return (
    <group>
      {/* Perimeter concrete boundary wall with safety hazard top rim */}
      {[-H / 2 + wallT / 2, H / 2 - wallT / 2].map((z, idx) => (
        <group key={`w-z-${idx}`} position={[0, wallH / 2, z]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[W, wallH, wallT]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          <mesh position={[0, wallH / 2 + 0.04, 0]}>
            <boxGeometry args={[W, 0.08, wallT + 0.06]} />
            <meshStandardMaterial color="#eab308" roughness={0.4} metalness={0.2} />
          </mesh>
        </group>
      ))}
      {[-W / 2 + wallT / 2, W / 2 - wallT / 2].map((x, idx) => (
        <group key={`w-x-${idx}`} position={[x, wallH / 2, 0]}>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[wallT, wallH, H]} />
            <meshStandardMaterial color="#0f172a" roughness={0.8} />
          </mesh>
          <mesh position={[0, wallH / 2 + 0.04, 0]}>
            <boxGeometry args={[wallT + 0.06, 0.08, H]} />
            <meshStandardMaterial color="#eab308" roughness={0.4} metalness={0.2} />
          </mesh>
        </group>
      ))}

      {/* Structural Steel I-Beam Columns along perimeter */}
      {cols.map(([x, z], i) => (
        <group key={`col-${i}`} position={[x, 0, z]}>
          {/* Yellow crash protection base */}
          <mesh position={[0, 0.6, 0]} castShadow>
            <boxGeometry args={[0.7, 1.2, 0.7]} />
            <meshStandardMaterial color="#eab308" roughness={0.4} metalness={0.2} />
          </mesh>
          {/* Steel column going up */}
          <mesh position={[0, 4.5, 0]} castShadow>
            <boxGeometry args={[0.42, 9, 0.42]} />
            <meshStandardMaterial color="#1e293b" roughness={0.5} metalness={0.7} />
          </mesh>
        </group>
      ))}

      {/* Overhead High-Bay LED Downlights */}
      {[-24, 0, 24].map((x) =>
        [-12, 12].map((z) => (
          <group key={`light-${x}-${z}`} position={[x, 7.8, z]}>
            <mesh castShadow>
              <boxGeometry args={[1.6, 0.25, 0.8]} />
              <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
            </mesh>
            <mesh position={[0, -0.14, 0]}>
              <boxGeometry args={[1.4, 0.04, 0.6]} />
              <meshBasicMaterial color="#f0f9ff" toneMapped={false} />
            </mesh>
            <pointLight color="#e0f2fe" intensity={0.9} distance={22} decay={2} />
          </group>
        ))
      )}

      {/* Perimeter Green Pedestrian Safety Corridor Tape */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, -H / 2 + 1.8]}>
        <planeGeometry args={[W - 4, 0.7]} />
        <meshBasicMaterial color="#065f46" transparent opacity={0.65} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, H / 2 - 1.8]}>
        <planeGeometry args={[W - 4, 0.7]} />
        <meshBasicMaterial color="#065f46" transparent opacity={0.65} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Industrial Storage Racks with Pallets & Cargo                              */
/* -------------------------------------------------------------------------- */

const BOX_COLORS = ['#d97706', '#b45309', '#c2410c', '#0284c7', '#059669', '#475569'];

function RackBay({ x, z, rotY = 0 }: { x: number; z: number; rotY?: number }) {
  const bayW = 3.6;
  const bayD = 1.1;
  const bayH = 3.4;

  const boxes = useMemo(() => {
    const list: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; c: string }> = [];
    const tiers = [0.95, 2.05, 3.15];
    tiers.forEach((ty, tIdx) => {
      // 2 pallets per level
      [-0.9, 0.9].forEach((px, pIdx) => {
        const seed = (Math.abs(x * 13 + z * 7 + tIdx * 5 + pIdx * 11) % 100) / 100;
        // Pallet box stack
        const count = seed > 0.4 ? 2 : 1;
        if (count === 1) {
          list.push({
            x: px,
            y: ty + 0.38,
            z: 0,
            sx: 1.1,
            sy: 0.65,
            sz: 0.85,
            c: BOX_COLORS[(Math.floor(seed * 10)) % BOX_COLORS.length],
          });
        } else {
          list.push(
            {
              x: px - 0.28,
              y: ty + 0.3,
              z: 0,
              sx: 0.52,
              sy: 0.52,
              sz: 0.82,
              c: BOX_COLORS[(Math.floor(seed * 10)) % BOX_COLORS.length],
            },
            {
              x: px + 0.28,
              y: ty + 0.34,
              z: 0,
              sx: 0.54,
              sy: 0.58,
              sz: 0.82,
              c: BOX_COLORS[(Math.floor(seed * 10 + 2)) % BOX_COLORS.length],
            }
          );
        }
      });
    });
    return list;
  }, [x, z]);

  return (
    <group position={[x, 0, z]} rotation-y={rotY}>
      {/* 4 Upright steel blue vertical posts */}
      {[-bayW / 2, bayW / 2].map((px) =>
        [-bayD / 2, bayD / 2].map((pz) => (
          <mesh key={`post-${px}-${pz}`} position={[px, bayH / 2, pz]} castShadow>
            <boxGeometry args={[0.09, bayH, 0.09]} />
            <meshStandardMaterial color="#0284c7" metalness={0.6} roughness={0.4} />
          </mesh>
        ))
      )}

      {/* 3 Tier horizontal safety orange load beams */}
      {[0.9, 2.0, 3.1].map((ty, i) => (
        <group key={`tier-${i}`} position={[0, ty, 0]}>
          {/* Front & Back Beams */}
          <mesh position={[0, 0, -bayD / 2]} castShadow>
            <boxGeometry args={[bayW, 0.09, 0.07]} />
            <meshStandardMaterial color="#ea580c" metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[0, 0, bayD / 2]} castShadow>
            <boxGeometry args={[bayW, 0.09, 0.07]} />
            <meshStandardMaterial color="#ea580c" metalness={0.5} roughness={0.4} />
          </mesh>

          {/* Wooden Pallets */}
          {[-0.9, 0.9].map((px, pIdx) => (
            <mesh key={`pallet-${pIdx}`} position={[px, 0.06, 0]} castShadow>
              <boxGeometry args={[1.35, 0.09, 0.95]} />
              <meshStandardMaterial color="#92400e" roughness={0.8} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Stacked Cargo Boxes */}
      {boxes.map((b, i) => (
        <mesh key={`box-${i}`} position={[b.x, b.y, b.z]} castShadow>
          <boxGeometry args={[b.sx, b.sy, b.sz]} />
          <meshStandardMaterial color={b.c} roughness={0.65} />
        </mesh>
      ))}
    </group>
  );
}

function IndustrialRacking({ W, H }: { W: number; H: number }) {
  // Placement of realistic rack blocks in non-driving quadrants
  const rackBays = useMemo(() => {
    const list: Array<{ x: number; z: number; rotY?: number }> = [];

    // Top-Left Quadrant (between X: -26 to -6, Z: -11 to -4)
    [-24, -19.5, -15, -10.5].forEach((x) => {
      list.push({ x, z: -9.8 });
      list.push({ x, z: -6.2 });
    });

    // Top-Right Quadrant (between X: 6 to 26, Z: -11 to -4)
    [10.5, 15, 19.5, 24].forEach((x) => {
      list.push({ x, z: -9.8 });
      list.push({ x, z: -6.2 });
    });

    // Bottom-Left Quadrant (between X: -26 to -6, Z: 4 to 11)
    [-24, -19.5, -15, -10.5].forEach((x) => {
      list.push({ x, z: 6.2 });
      list.push({ x, z: 9.8 });
    });

    // Bottom-Right Quadrant (between X: 6 to 26, Z: 4 to 11)
    [10.5, 15, 19.5, 24].forEach((x) => {
      list.push({ x, z: 6.2 });
      list.push({ x, z: 9.8 });
    });

    // Top North Perimeter Storage (Z = -20.5)
    [-24, -19.5, -15, -10.5, 10.5, 15, 19.5, 24].forEach((x) => {
      list.push({ x, z: -20.5 });
    });

    // Bottom South Perimeter Storage (Z = 20.5)
    [-22, -17.5, 17.5, 22].forEach((x) => {
      list.push({ x, z: 20.5 });
    });

    // West Wall Vertical Storage (X = -35.5)
    [-11, -6.5, 6.5, 11].forEach((z) => {
      list.push({ x: -35.5, z, rotY: Math.PI / 2 });
    });

    // East Wall Vertical Storage (X = 35.5)
    [-11, -6.5, 6.5, 11].forEach((z) => {
      list.push({ x: 35.5, z, rotY: Math.PI / 2 });
    });

    return list;
  }, []);

  return (
    <group>
      {rackBays.map((r, i) => (
        <RackBay key={`rack-${i}`} x={r.x} z={r.z} rotY={r.rotY} />
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Floor, walls, safety tape                                                  */
/* -------------------------------------------------------------------------- */

function Floor({ W, H, showGrid }: { W: number; H: number; showGrid: boolean }) {
  const tape = 0.35;
  return (
    <group>
      {/* cyber platform plinth */}
      <mesh position={[0, -0.32, 0]} receiveShadow>
        <boxGeometry args={[W + 2, 0.6, H + 2]} />
        <meshStandardMaterial color="#0b121c" roughness={0.9} />
      </mesh>
      {/* High-quality polished epoxy concrete floor with subtle specular sheen */}
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[W, H]} />
        <meshStandardMaterial
          color="#080e18"
          roughness={0.42}
          metalness={0.25}
        />
      </mesh>

      {/* Warehouse Facility Perimeter Architecture */}
      <FacilityPerimeter W={W} H={H} />

      {/* Industrial Warehouse Storage Racks */}
      <IndustrialRacking W={W} H={H} />

      {showGrid && (
        <Grid
          position={[0, 0.012, 0]}
          args={[W, H]}
          cellSize={5}
          cellThickness={0.8}
          cellColor="#142236"
          sectionSize={20}
          sectionThickness={1.2}
          sectionColor="#1e3452"
          fadeDistance={1000}
          fadeStrength={0}
          infiniteGrid={false}
          side={THREE.DoubleSide}
        />
      )}
      {/* laser cyan perimeter boundary */}
      <mesh position={[0, 0.02, -(H / 2 - tape / 2)]}>
        <boxGeometry args={[W, 0.03, tape]} />
        <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[0, 0.02, H / 2 - tape / 2]}>
        <boxGeometry args={[W, 0.03, tape]} />
        <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[-(W / 2 - tape / 2), 0.02, 0]}>
        <boxGeometry args={[tape, 0.03, H]} />
        <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={0.6} />
      </mesh>
      <mesh position={[W / 2 - tape / 2, 0.02, 0]}>
        <boxGeometry args={[tape, 0.03, H]} />
        <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={0.6} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Workstations (Pick & Drop Bays) & Charging Monoliths                       */
/* -------------------------------------------------------------------------- */

function WorkstationBay({
  node,
  cx,
  cz,
  kind,
}: {
  node: MapNode;
  cx: number;
  cz: number;
  kind: 'pick' | 'drop';
}) {
  const isPick = kind === 'pick';
  const color = isPick ? '#10b981' : '#0ea5e9';
  const label = isPick ? 'INBOUND // PICK' : 'OUTBOUND // DROP';
  const x = node.x - cx;
  const z = node.y - cz;

  return (
    <group position={[x, 0, z]}>
      {/* Floor hazard docking pad */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <planeGeometry args={[3.2, 3.2]} />
        <meshStandardMaterial color="#0b1320" roughness={0.7} />
      </mesh>
      {/* Docking safety outline */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.025}>
        <ringGeometry args={[1.4, 1.55, 32]} />
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>

      {/* Roller Conveyor Transfer Table */}
      <group position={[0, 0.45, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.8, 0.8, 1.6]} />
          <meshStandardMaterial color="#1e293b" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Stainless Steel Conveyor Rollers */}
        {[-1.0, -0.6, -0.2, 0.2, 0.6, 1.0].map((rx) => (
          <mesh key={`roller-${rx}`} position={[rx, 0.42, 0]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 1.48, 16]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
        {/* Side safety barrier rails */}
        <mesh position={[0, 0.52, -0.8]} castShadow>
          <boxGeometry args={[2.8, 0.15, 0.06]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.52, 0.8]} castShadow>
          <boxGeometry args={[2.8, 0.15, 0.06]} />
          <meshStandardMaterial color={color} metalness={0.5} roughness={0.4} />
        </mesh>
      </group>

      {/* Overhead Digital Sign Gantry */}
      <group position={[0, 2.8, 0]}>
        <mesh position={[-1.3, -1.0, 0]} castShadow>
          <boxGeometry args={[0.08, 2.0, 0.08]} />
          <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
        <mesh position={[1.3, -1.0, 0]} castShadow>
          <boxGeometry args={[0.08, 2.0, 0.08]} />
          <meshStandardMaterial color="#334155" metalness={0.6} />
        </mesh>
        <mesh castShadow>
          <boxGeometry args={[2.8, 0.55, 0.14]} />
          <meshStandardMaterial color="#090d16" roughness={0.3} metalness={0.8} />
        </mesh>
        <Html position={[0, 0, 0.08]} center transform scale={0.22}>
          <div
            style={{
              padding: '4px 14px',
              borderRadius: 6,
              background: 'rgba(8, 14, 24, 0.95)',
              border: `1.5px solid ${color}`,
              color: '#ffffff',
              fontSize: 13,
              fontWeight: 800,
              fontFamily: 'monospace',
              letterSpacing: '0.08em',
              whiteSpace: 'nowrap',
              boxShadow: `0 0 16px ${color}88`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
            <span>{node.name.toUpperCase()} · {label}</span>
          </div>
        </Html>
      </group>
    </group>
  );
}

function ChargingDock({ node, cx, cz }: { node: MapNode; cx: number; cz: number }) {
  const x = node.x - cx;
  const z = node.y - cz;

  return (
    <group position={[x, 0, z]}>
      {/* Floor Docking Pad */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.02} receiveShadow>
        <planeGeometry args={[2.6, 2.6]} />
        <meshStandardMaterial color="#0a121e" roughness={0.6} />
      </mesh>
      {/* Copper Inductive Charging Coil Rings */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.025}>
        <ringGeometry args={[0.3, 0.85, 32]} />
        <meshStandardMaterial color="#b45309" metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.03}>
        <ringGeometry args={[0.95, 1.15, 32]} />
        <meshBasicMaterial color="#0ea5e9" transparent opacity={0.7} side={THREE.DoubleSide} />
      </mesh>

      {/* Wheel Docking Alignment Guides */}
      {[-0.65, 0.65].map((gx) => (
        <mesh key={`guide-${gx}`} position={[gx, 0.05, 0]} castShadow>
          <boxGeometry args={[0.08, 0.1, 1.8]} />
          <meshStandardMaterial color="#eab308" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}

      {/* Charging Monolith Tower */}
      <group position={[0, 1.4, -1.05]}>
        <mesh castShadow>
          <boxGeometry args={[0.85, 2.8, 0.55]} />
          <meshStandardMaterial color="#0f172a" roughness={0.3} metalness={0.7} />
        </mesh>
        <mesh position={[0, 0.2, 0.29]}>
          <boxGeometry args={[0.55, 1.8, 0.04]} />
          <meshStandardMaterial color="#0284c7" emissive="#0ea5e9" emissiveIntensity={0.8} />
        </mesh>
        <Html position={[0, 1.7, 0]} center transform scale={0.2}>
          <div
            style={{
              padding: '3px 10px',
              borderRadius: 6,
              background: '#09111c',
              border: '1.5px solid #0ea5e9',
              color: '#38bdf8',
              fontSize: 12,
              fontWeight: 800,
              fontFamily: 'monospace',
              letterSpacing: '0.05em',
              whiteSpace: 'nowrap',
              boxShadow: '0 0 12px rgba(14, 165, 233, 0.5)',
            }}
          >
            ⚡ {node.name.toUpperCase()} · 48V RAPID
          </div>
        </Html>
      </group>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Map nodes                                                                  */
/* -------------------------------------------------------------------------- */

function NodeLayer({
  nodes,
  cx,
  cz,
  showLabels,
}: {
  nodes: MapNode[];
  cx: number;
  cz: number;
  showLabels: boolean;
}) {
  const isPick = (n: MapNode) => n.type === 'pick' || n.id.startsWith('p');
  const isDrop = (n: MapNode) => n.type === 'drop' || n.id.startsWith('d');
  const isCharge = (n: MapNode) =>
    n.type === 'charger' || n.type === 'charge' || n.id.startsWith('c');
  const isJunction = (n: MapNode) =>
    n.type === 'junction' || n.id.startsWith('n');

  const junctions = useMemo(() => nodes.filter(isJunction), [nodes]);
  const waypoints = useMemo(
    () => nodes.filter((n) => !isPick(n) && !isDrop(n) && !isCharge(n) && !isJunction(n)),
    [nodes]
  );

  return (
    <group>
      {/* Pick Workstations */}
      {nodes.filter(isPick).map((n) => (
        <WorkstationBay key={n.id} node={n} cx={cx} cz={cz} kind="pick" />
      ))}

      {/* Drop Workstations */}
      {nodes.filter(isDrop).map((n) => (
        <WorkstationBay key={n.id} node={n} cx={cx} cz={cz} kind="drop" />
      ))}

      {/* Charging Docks */}
      {nodes.filter(isCharge).map((n) => (
        <ChargingDock key={n.id} node={n} cx={cx} cz={cz} />
      ))}

      {/* Junction Turn Pads */}
      {junctions.map((n) => (
        <group key={n.id} position={[n.x - cx, 0.03, n.y - cz]}>
          <mesh rotation-x={-Math.PI / 2}>
            <circleGeometry args={[0.9, 16]} />
            <meshStandardMaterial color="#1e293b" roughness={0.6} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
            <ringGeometry args={[0.75, 0.88, 16]} />
            <meshBasicMaterial color="#0ea5e9" transparent opacity={0.7} />
          </mesh>
        </group>
      ))}

      {/* Waypoints */}
      {waypoints.map((n) => (
        <mesh key={n.id} position={[n.x - cx, 0.03, n.y - cz]} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[0.3, 12]} />
          <meshStandardMaterial color="#475569" roughness={0.7} />
        </mesh>
      ))}

      {/* Node Labels */}
      {showLabels &&
        nodes
          .filter((n) => !isPick(n) && !isDrop(n) && !isCharge(n))
          .map((n) => (
            <Html
              key={n.id}
              position={[n.x - cx, 1.2, n.y - cz]}
              center
              zIndexRange={[10, 0]}
              style={{ pointerEvents: 'none' }}
            >
              <div className="wh3d-node">{n.name}</div>
            </Html>
          ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Lanes (edges), direction arrows, blocked markers                           */
/* -------------------------------------------------------------------------- */

interface LaneGeom {
  id: string;
  mx: number;
  mz: number;
  len: number;
  ang: number; // map-space angle atan2(dy, dx)
  oneWay: boolean;
}

function Lanes({
  nodes,
  edges,
  blocked,
  cx,
  cz,
  reduceMotion,
  onSelectEdge,
}: {
  nodes: MapNode[];
  edges: MapEdge[];
  blocked: Set<string>;
  cx: number;
  cz: number;
  reduceMotion: boolean;
  onSelectEdge?: (edgeId: string) => void;
}) {
  const lanes = useMemo<LaneGeom[]>(() => {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const out: LaneGeom[] = [];
    for (const e of edges) {
      const s = byId.get(e.source);
      const t = byId.get(e.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;
      out.push({
        id: e.id,
        mx: (s.x + t.x) / 2 - cx,
        mz: (s.y + t.y) / 2 - cz,
        len,
        ang: Math.atan2(dy, dx),
        oneWay: e.bidirectional === false,
      });
    }
    return out;
  }, [nodes, edges, cx, cz]);

  const { open, shut } = useMemo(() => {
    const o: LaneGeom[] = [];
    const s: LaneGeom[] = [];
    for (const l of lanes) (blocked.has(l.id) ? s : o).push(l);
    return { open: o, shut: s };
  }, [lanes, blocked]);

  const toItem = (l: LaneGeom, w = LANE_WIDTH): InstItem => ({
    p: [l.mx, 0.02, l.mz],
    ry: -l.ang,
    s: [l.len, 0.03, w],
  });

  const openItems = useMemo(() => open.map((l) => toItem(l)), [open]);
  const shutItems = useMemo(() => shut.map((l) => toItem(l, LANE_WIDTH * 1.3)), [shut]);

  const arrowItems = useMemo<InstItem[]>(
    () =>
      lanes
        .filter((l) => l.oneWay)
        .map((l) => ({
          p: [l.mx + Math.cos(l.ang) * l.len * 0.1, 0.08, l.mz + Math.sin(l.ang) * l.len * 0.1],
          ry: -l.ang,
          rz: -Math.PI / 2, // cone tip (+Y) -> +X, then yaw onto the lane
          s: [0.55, 0.9, 0.55],
        })),
    [lanes],
  );

  const [hover, setHover] = useState<{ kind: 'open' | 'shut'; index: number } | null>(null);
  const hoverLane = hover ? (hover.kind === 'open' ? open : shut)[hover.index] : undefined;
  useCursor(!!hoverLane && !!onSelectEdge);

  const shutMat = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock }) => {
    if (!shutMat.current) return;
    const k = reduceMotion ? 1 : 0.7 + 0.3 * Math.sin(clock.elapsedTime * 4);
    shutMat.current.color.set(LANE_BLOCKED).multiplyScalar(k);
  });

  const interactive = !!onSelectEdge;

  return (
    <group>
      <Instanced
        items={openItems}
        onPick={interactive ? (i) => onSelectEdge?.(open[i].id) : undefined}
        onHover={interactive ? (i) => setHover(i == null ? null : { kind: 'open', index: i }) : undefined}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial color={LANE_COLOR} />
      </Instanced>

      <Instanced
        items={shutItems}
        onPick={interactive ? (i) => onSelectEdge?.(shut[i].id) : undefined}
        onHover={interactive ? (i) => setHover(i == null ? null : { kind: 'shut', index: i }) : undefined}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial ref={shutMat} color={LANE_BLOCKED} />
      </Instanced>

      <Instanced items={arrowItems}>
        <coneGeometry args={[1, 1, 3]} />
        <meshBasicMaterial color="#7d8ea3" />
      </Instanced>

      {/* traffic cone on every blocked lane */}
      {shut.map((l) => (
        <group key={l.id} position={[l.mx, 0, l.mz]}>
          <mesh position-y={0.06}>
            <boxGeometry args={[0.9, 0.12, 0.9]} />
            <meshStandardMaterial color="#20262e" />
          </mesh>
          <mesh position-y={0.8} castShadow>
            <coneGeometry args={[0.42, 1.5, 16]} />
            <meshStandardMaterial color="#ff4d5e" emissive="#ff4d5e" emissiveIntensity={0.5} />
          </mesh>
          <mesh position-y={0.7}>
            <cylinderGeometry args={[0.33, 0.37, 0.16, 16]} />
            <meshStandardMaterial color="#f4f6f8" />
          </mesh>
        </group>
      ))}

      {hoverLane && (
        <>
          <mesh position={[hoverLane.mx, 0.05, hoverLane.mz]} rotation-y={-hoverLane.ang}>
            <boxGeometry args={[hoverLane.len, 0.03, LANE_WIDTH * 1.5]} />
            <meshBasicMaterial color={AMBER} transparent opacity={0.85} depthWrite={false} />
          </mesh>
          <Html
            position={[hoverLane.mx, 1.4, hoverLane.mz]}
            center
            zIndexRange={[20, 0]}
            style={{ pointerEvents: 'none' }}
          >
            <div className="wh3d-tag">
              <span>Lane {hoverLane.id}</span>
              {blocked.has(hoverLane.id) && <span className="wh3d-muted">blocked</span>}
            </div>
          </Html>
        </>
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hazards                                                                    */
/* -------------------------------------------------------------------------- */

type Hazard = NonNullable<WorldView['hazards']>[number];

function HazardZone({
  hazard,
  cx,
  cz,
  reduceMotion,
}: {
  hazard: Hazard;
  cx: number;
  cz: number;
  reduceMotion: boolean;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const color = hazardColor(hazard.severity);
  const r = Math.max(hazard.radius, 0.5);

  useFrame(({ clock }) => {
    if (!ring.current) return;
    ring.current.scale.setScalar(reduceMotion ? 1 : 1 + 0.03 * Math.sin(clock.elapsedTime * 3));
  });

  return (
    <group position={[hazard.x - cx, 0, hazard.y - cz]}>
      <mesh
        rotation-x={-Math.PI / 2}
        position-y={0.045}
        onPointerOver={() => setHover(true)}
        onPointerOut={() => setHover(false)}
      >
        <circleGeometry args={[r, 64]} />
        <meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.05}>
        <ringGeometry args={[Math.max(r - 0.35, 0.05), r, 64]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh position-y={0.75} castShadow>
        <coneGeometry args={[0.55, 1.5, 4]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
      {hover && (
        <Html position={[0, 2.2, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="wh3d-tag">
            <span className="wh3d-dot" style={{ background: color }} />
            <span>
              {hazard.type}, {hazard.severity}
            </span>
          </div>
        </Html>
      )}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  AMR                                                                        */
/* -------------------------------------------------------------------------- */

const AMR_GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24),
  hex: new THREE.CylinderGeometry(1, 1.08, 1, 6),
  ring: new THREE.TorusGeometry(1, 0.06, 8, 48),
  circle: new THREE.CircleGeometry(1, 32),
  sphere: new THREE.SphereGeometry(1, 16, 16),
};

const AMR_MAT = {
  skirt:       new THREE.MeshStandardMaterial({ color: '#090e17', roughness: 0.85, metalness: 0.35 }),
  body:        new THREE.MeshStandardMaterial({ color: '#1a2433', roughness: 0.32, metalness: 0.82 }),
  panel:       new THREE.MeshStandardMaterial({ color: '#101826', roughness: 0.42, metalness: 0.72 }),
  bumper:      new THREE.MeshStandardMaterial({ color: '#0c121c', roughness: 0.75, metalness: 0.4 }),
  metalTrim:   new THREE.MeshStandardMaterial({ color: '#64748b', roughness: 0.22, metalness: 0.92 }),
  bracket:     new THREE.MeshStandardMaterial({ color: '#16202e', roughness: 0.35, metalness: 0.85 }),
  wheelHub:    new THREE.MeshStandardMaterial({ color: '#1f2937', roughness: 0.3,  metalness: 0.8 }),
  wheelRoller: new THREE.MeshStandardMaterial({ color: '#0a0d14', roughness: 0.9,  metalness: 0.15 }),
  lidarBase:   new THREE.MeshStandardMaterial({ color: '#090f1a', roughness: 0.2,  metalness: 0.95 }),
  lidarCap:    new THREE.MeshStandardMaterial({ color: '#10b981', roughness: 0.15, metalness: 0.85, emissive: '#064e3b', emissiveIntensity: 0.4 }),
  lens:        new THREE.MeshStandardMaterial({ color: '#020617', roughness: 0.05, metalness: 0.98 }),
};

/* Memoized top deck texture replicating the NEXUS-7 stencil graphics from reference photo */
let amrDeckTextureCache: THREE.CanvasTexture | null = null;
function getAmrDeckTexture(): THREE.CanvasTexture {
  if (!amrDeckTextureCache && typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 768;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Dark slate metallic background
      ctx.fillStyle = '#141d2b';
      ctx.fillRect(0, 0, 1024, 768);

      // Chamfered border seam
      ctx.strokeStyle = '#27354a';
      ctx.lineWidth = 14;
      ctx.strokeRect(30, 30, 964, 708);

      // Inner inset panel
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 6;
      ctx.strokeRect(70, 70, 884, 628);

      // "UNIT 04" stencil marking
      ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
      ctx.font = 'bold 38px "Segoe UI", -apple-system, sans-serif';
      ctx.fillText('UNIT 04', 120, 190);

      ctx.fillStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('SLAM LiDAR ACTIVE · DOCK: READY', 120, 225);

      // "NEXUS-7" bold stencil marking
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 64px "Segoe UI", -apple-system, sans-serif';
      ctx.fillText('NEXUS-7', 520, 380);

      ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
      ctx.font = 'bold 20px monospace';
      ctx.fillText('AUTONOMOUS DOCKING SYSTEM', 520, 420);
      ctx.fillText('HEAVY LOAD RATING: 1200 KG', 520, 450);

      // Front yellow-black warning hazard diagonal stripes
      const hx = 940;
      for (let y = 80; y < 680; y += 40) {
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.moveTo(hx, y);
        ctx.lineTo(hx + 30, y + 20);
        ctx.lineTo(hx + 30, y + 40);
        ctx.lineTo(hx, y + 20);
        ctx.fill();
      }

      // Corner hex bolts
      const bolts = [
        [90, 90], [934, 90], [90, 678], [934, 678],
        [512, 85], [512, 683], [95, 384], [929, 384]
      ];
      for (const [bx, by] of bolts) {
        ctx.beginPath();
        ctx.arc(bx, by, 16, 0, Math.PI * 2);
        ctx.fillStyle = '#0a1019';
        ctx.fill();
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
      }
    }

    amrDeckTextureCache = new THREE.CanvasTexture(canvas);
    amrDeckTextureCache.anisotropy = 4;
  }
  return amrDeckTextureCache!;
}

/* Heavy-Duty Mecanum Omnidirectional Wheel with 45° Slanted Rollers & Suspension Bracket */
const MecanumWheel = React.memo(function MecanumWheel({
  position,
  color,
  flip = false,
}: {
  position: [number, number, number];
  color: string;
  flip?: boolean;
}) {
  const rollerCount = 8;
  const wheelR = 0.125;
  const wheelW = 0.085;
  const rollerR = 0.032;
  const rollerL = 0.065;

  return (
    <group position={position}>
      {/* Heavy suspension swing-arm / bogie bracket */}
      <mesh
        geometry={AMR_GEO.box}
        material={AMR_MAT.bracket}
        position={[0, 0.04, flip ? 0.045 : -0.045]}
        scale={[0.26, 0.055, 0.02]}
      />
      {/* Pivot bolts on bracket */}
      <mesh
        geometry={AMR_GEO.cyl}
        material={AMR_MAT.metalTrim}
        position={[-0.1, 0.04, flip ? 0.055 : -0.055]}
        scale={[0.015, 0.01, 0.015]}
        rotation-x={Math.PI / 2}
      />
      <mesh
        geometry={AMR_GEO.cyl}
        material={AMR_MAT.metalTrim}
        position={[0.1, 0.04, flip ? 0.055 : -0.055]}
        scale={[0.015, 0.01, 0.015]}
        rotation-x={Math.PI / 2}
      />

      {/* Central wheel hub */}
      <mesh
        geometry={AMR_GEO.cyl}
        material={AMR_MAT.wheelHub}
        rotation-x={Math.PI / 2}
        scale={[wheelR * 0.72, wheelW * 0.7, wheelR * 0.72]}
      />

      {/* Outer metallic wheel rim with neon glow ring */}
      <mesh
        geometry={AMR_GEO.ring}
        rotation-x={Math.PI / 2}
        position-z={flip ? 0.045 : -0.045}
        scale={[wheelR * 0.85, wheelR * 0.85, 0.01]}
      >
        <meshBasicMaterial color={color} transparent opacity={0.6} toneMapped={false} />
      </mesh>

      {/* Slanted Mecanum rollers */}
      {Array.from({ length: rollerCount }).map((_, i) => {
        const angle = (i / rollerCount) * Math.PI * 2;
        const rx = Math.cos(angle) * wheelR;
        const ry = Math.sin(angle) * wheelR;
        const slant = (flip ? 1 : -1) * (Math.PI / 4);

        return (
          <group key={i} position={[rx, ry, 0]} rotation-z={angle}>
            <mesh
              geometry={AMR_GEO.cyl}
              material={AMR_MAT.wheelRoller}
              rotation-x={slant}
              scale={[rollerR, rollerL, rollerR]}
            />
          </group>
        );
      })}
    </group>
  );
});

interface AmrMeshProps {
  amr: AmrView;
  cx: number;
  cz: number;
  selected: boolean;
  showPath: boolean;
  reduceMotion: boolean;
  onSelect: (id: string | null) => void;
}

const AmrMesh = React.memo(function AmrMesh({
  amr,
  cx,
  cz,
  selected,
  showPath,
  reduceMotion,
  onSelect,
}: AmrMeshProps) {
  const outer = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Group>(null);
  const ring = useRef<THREE.Mesh>(null);
  const lidarRef = useRef<THREE.Group>(null);
  const radarRef = useRef<THREE.Group>(null);
  const ledMat = useRef<THREE.MeshBasicMaterial>(null);

  const target = useRef(amr);
  target.current = amr;
  const initialised = useRef(false);
  const lastPos = useRef({ x: amr.x, y: amr.y });
  const derivedHeading = useRef(0);

  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const deckTexture = useMemo(() => getAmrDeckTexture(), []);

  useFrame((state, dt) => {
    const g = outer.current;
    const r = inner.current;
    if (!g || !r) return;
    const a = target.current;
    const t = state.clock.elapsedTime;

    /* position: glide towards the latest reported pose */
    const tx = a.x - cx;
    const tz = a.y - cz;
    const ddx = tx - g.position.x;
    const ddz = tz - g.position.z;

    /* heading: reported value, otherwise direction of travel */
    const mdx = a.x - lastPos.current.x;
    const mdy = a.y - lastPos.current.y;
    if (mdx * mdx + mdy * mdy > 1e-4) {
      derivedHeading.current = Math.atan2(mdy, mdx);
      lastPos.current.x = a.x;
      lastPos.current.y = a.y;
    }
    const heading =
      a.heading != null && Number.isFinite(a.heading)
        ? headingToRadians(a.heading)
        : derivedHeading.current;
    const targetRy = -heading; // map angle -> rotation about +Y

    if (!initialised.current) {
      g.position.set(tx, 0, tz);
      r.rotation.y = targetRy;
      initialised.current = true;
    } else if (ddx * ddx + ddz * ddz > SNAP_DISTANCE * SNAP_DISTANCE) {
      g.position.set(tx, 0, tz);
      r.rotation.y = targetRy;
    } else {
      g.position.x = THREE.MathUtils.damp(g.position.x, tx, POS_LAMBDA, dt);
      g.position.z = THREE.MathUtils.damp(g.position.z, tz, POS_LAMBDA, dt);
      r.rotation.y += normalizeAngle(targetRy - r.rotation.y) * (1 - Math.exp(-ROT_LAMBDA * dt));
    }

    /* spin LiDAR turret laser emitter */
    if (lidarRef.current) {
      lidarRef.current.rotation.y += dt * 10;
    }

    /* spin active radar scan wedge across top deck (matches reference image) */
    if (radarRef.current) {
      radarRef.current.rotation.y -= dt * 3.8;
    }

    /* status light glow & pulse */
    const sc = statusThree(a.status);
    let k = 1;
    if (!reduceMotion) {
      switch (a.status) {
        case 'BLOCKED':
          k = Math.sin(t * Math.PI * 4) > 0 ? 1 : 0.25;
          break;
        case 'ERROR':
          k = Math.sin(t * Math.PI * 6) > 0 ? 1 : 0.1;
          break;
        case 'CHARGING':
          k = 0.55 + 0.45 * Math.sin(t * Math.PI * 1.6);
          break;
        case 'IDLE':
          k = 0.6;
          break;
        case 'OFFLINE':
          k = 0.05;
          break;
        default:
          k = 1;
      }
    } else if (a.status === 'OFFLINE') {
      k = 0.05;
    }

    if (ledMat.current) {
      ledMat.current.color.copy(TMP_COLOR.copy(sc).multiplyScalar(0.45 + 0.75 * k));
    }

    if (ring.current && !reduceMotion) {
      ring.current.scale.setScalar(1 + 0.05 * Math.sin(t * 4));
    }
  });

  const pathPoints = useMemo(() => {
    if (!amr.path || amr.path.length === 0) return null;
    const pts: [number, number, number][] = [[amr.x - cx, 0.1, amr.y - cz]];
    for (const p of amr.path) pts.push([p.x - cx, 0.1, p.y - cz]);
    return pts;
  }, [amr.path, amr.x, amr.y, cx, cz]);

  const pct = clampPct(amr.battery);
  const barW = Math.max(pct / 100, 0.001) * 1.4;
  const color = statusColor(amr.status);
  const lastPoint = pathPoints ? pathPoints[pathPoints.length - 1] : null;

  // Chassis dimension constants
  const hx = 0.64;
  const hw = 0.47;
  const c = 0.18; // chamfer corner size
  const ledY = 0.32;

  return (
    <>
      <group
        ref={outer}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(selected ? null : amr.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <group ref={inner} scale={VISUAL_SCALE}>
          {/* Low-profile heavy base skid frame */}
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.skirt}
            position={[0, 0.06, 0]}
            scale={[1.28, 0.1, 0.94]}
          />

          {/* 4 Heavy-Duty Mecanum Omnidirectional Wheels with Suspension Arms */}
          <MecanumWheel position={[ 0.42, 0.12,  0.48]} color={color} flip={false} />
          <MecanumWheel position={[ 0.42, 0.12, -0.48]} color={color} flip={true} />
          <MecanumWheel position={[-0.42, 0.12,  0.48]} color={color} flip={true} />
          <MecanumWheel position={[-0.42, 0.12, -0.48]} color={color} flip={false} />

          {/* Main Octagonal Armored Hull (Titanium Slate Metallic Finish) */}
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.body}
            position={[0, 0.28, 0]}
            scale={[1.28, 0.34, 0.94]}
            castShadow
          />

          {/* 4 Corner Chamfer Wedges (Beveled Armor Contours) */}
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.body}
            position={[hx - c * 0.5, 0.28, -hw + c * 0.5]}
            rotation-y={Math.PI / 4}
            scale={[c * 1.41, 0.342, 0.12]}
          />
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.body}
            position={[hx - c * 0.5, 0.28, hw - c * 0.5]}
            rotation-y={-Math.PI / 4}
            scale={[c * 1.41, 0.342, 0.12]}
          />
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.body}
            position={[-hx + c * 0.5, 0.28, -hw + c * 0.5]}
            rotation-y={-Math.PI / 4}
            scale={[c * 1.41, 0.342, 0.12]}
          />
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.body}
            position={[-hx + c * 0.5, 0.28, hw - c * 0.5]}
            rotation-y={Math.PI / 4}
            scale={[c * 1.41, 0.342, 0.12]}
          />

          {/* Front Bumper & Center Recessed Notch for Stereoscopic Sensor Pod */}
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.bumper}
            position={[hx + 0.015, 0.26, 0]}
            scale={[0.04, 0.22, 0.88]}
          />
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.skirt}
            position={[hx - 0.02, 0.26, 0]}
            scale={[0.1, 0.14, 0.22]}
          />
          {/* Dual front stereoscopic camera lenses in recessed notch */}
          <mesh position={[hx + 0.025, 0.26, -0.055]} material={AMR_MAT.lens}>
            <sphereGeometry args={[0.025, 12, 12]} />
          </mesh>
          <mesh position={[hx + 0.025, 0.26,  0.055]} material={AMR_MAT.lens}>
            <sphereGeometry args={[0.025, 12, 12]} />
          </mesh>
          {/* Front power/status indicator LED */}
          <mesh position={[hx + 0.028, 0.32, 0]} rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[0.01, 0.01, 0.012, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* Wraparound Continuous Perimeter Neon LED Light Ribbon (NEXUS-7 style) */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* Front-left strip */}
          <mesh position={[hx + 0.02, ledY, -0.22]} scale={[0.025, 0.035, 0.24]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial ref={ledMat} color={color} toneMapped={false} />
          </mesh>
          {/* Front-right strip */}
          <mesh position={[hx + 0.02, ledY, 0.22]} scale={[0.025, 0.035, 0.24]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Front-left chamfer strip */}
          <mesh
            position={[hx - c * 0.5, ledY, -hw + c * 0.5]}
            rotation-y={Math.PI / 4}
            scale={[0.025, 0.035, c * 1.41]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Front-right chamfer strip */}
          <mesh
            position={[hx - c * 0.5, ledY, hw - c * 0.5]}
            rotation-y={-Math.PI / 4}
            scale={[0.025, 0.035, c * 1.41]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Left side strip */}
          <mesh position={[0, ledY, -hw - 0.01]} scale={[hx * 2 - c * 2, 0.035, 0.025]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Right side strip */}
          <mesh position={[0, ledY, hw + 0.01]} scale={[hx * 2 - c * 2, 0.035, 0.025]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Rear-left chamfer strip */}
          <mesh
            position={[-hx + c * 0.5, ledY, -hw + c * 0.5]}
            rotation-y={-Math.PI / 4}
            scale={[0.025, 0.035, c * 1.41]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Rear-right chamfer strip */}
          <mesh
            position={[-hx + c * 0.5, ledY, hw - c * 0.5]}
            rotation-y={Math.PI / 4}
            scale={[0.025, 0.035, c * 1.41]}
          >
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
          {/* Rear status strip */}
          <mesh position={[-hx - 0.01, ledY, 0]} scale={[0.025, 0.035, hw * 2 - c * 2]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={amr.status === 'BLOCKED' ? '#f59e0b' : color} toneMapped={false} />
          </mesh>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* Top Armor Deck Plate with Stencil Graphics (UNIT 04 & NEXUS-7)  */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <mesh
            geometry={AMR_GEO.box}
            material={AMR_MAT.panel}
            position={[0, 0.46, 0]}
            scale={[1.12, 0.035, 0.82]}
          />
          <mesh position={[0, 0.48, 0]} rotation-x={-Math.PI / 2}>
            <planeGeometry args={[1.08, 0.78]} />
            <meshStandardMaterial
              map={deckTexture}
              roughness={0.32}
              metalness={0.7}
              transparent
              opacity={0.96}
            />
          </mesh>

          {/* Top Deck Circular Optical Sensor Ports (Matching Reference Photo) */}
          <group position={[0.22, 0.485, -0.24]}>
            <mesh geometry={AMR_GEO.ring} material={AMR_MAT.metalTrim} rotation-x={Math.PI / 2} scale={[0.065, 0.065, 0.01]} />
            <mesh geometry={AMR_GEO.cyl} material={AMR_MAT.lens} scale={[0.045, 0.012, 0.045]} />
            <mesh geometry={AMR_GEO.cyl} material={AMR_MAT.metalTrim} position={[0, 0.008, 0]} scale={[0.012, 0.01, 0.012]} />
          </group>

          <group position={[0.22, 0.485, 0.24]}>
            <mesh geometry={AMR_GEO.ring} material={AMR_MAT.metalTrim} rotation-x={Math.PI / 2} scale={[0.065, 0.065, 0.01]} />
            <mesh geometry={AMR_GEO.cyl} material={AMR_MAT.lens} scale={[0.045, 0.012, 0.045]} />
            <mesh geometry={AMR_GEO.cyl} material={AMR_MAT.metalTrim} position={[0, 0.008, 0]} scale={[0.012, 0.01, 0.012]} />
          </group>

          {/* Recessed Cooling Heat-Sink Vents with Slats (Matching Reference Photo) */}
          {[-0.25, 0.25].map((zPos, idx) => (
            <group key={`vent_${idx}`} position={[-0.26, 0.483, zPos]}>
              <mesh scale={[0.24, 0.01, 0.12]}>
                <boxGeometry args={[1, 1, 1]} />
                <meshStandardMaterial color="#080d16" roughness={0.9} />
              </mesh>
              {[-0.08, -0.04, 0, 0.04, 0.08].map((vx, vi) => (
                <mesh key={`fin_${vi}`} position={[vx, 0.008, 0]} scale={[0.012, 0.01, 0.1]} material={AMR_MAT.metalTrim}>
                  <boxGeometry args={[1, 1, 1]} />
                </mesh>
              ))}
            </group>
          ))}

          {/* Side Recessed Lifting/Tie-Down Handles */}
          <mesh position={[0, 0.485, -0.37]} scale={[0.22, 0.015, 0.035]} material={AMR_MAT.metalTrim}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
          <mesh position={[0, 0.485,  0.37]} scale={[0.22, 0.015, 0.035]} material={AMR_MAT.metalTrim}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* Central LiDAR Turret & Active Radar Scan Wave (NEXUS-7 style)    */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* Concentric radar wave rings radiating on the top deck */}
          <group position={[0, 0.486, 0]}>
            {[0.28, 0.44, 0.60].map((rad, idx) => (
              <mesh key={`radar_ring_${idx}`} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[rad, rad + 0.012, 36]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.65 - idx * 0.15}
                  toneMapped={false}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}

            {/* Sweeping active radar scan sector wedge (1-to-1 match with photo) */}
            <group ref={radarRef}>
              <mesh rotation-x={-Math.PI / 2}>
                <ringGeometry args={[0.12, 0.64, 32, 1, -Math.PI / 6, Math.PI / 3]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.42}
                  toneMapped={false}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
              {/* Radar leading edge bright pulse beam */}
              <mesh rotation-x={-Math.PI / 2} rotation-z={Math.PI / 6} position={[0.32, 0, 0]}>
                <planeGeometry args={[0.48, 0.018]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
              </mesh>
            </group>
          </group>

          {/* Central Stepped LiDAR Turret */}
          <group position={[0, 0.5, 0]}>
            {/* Stepped titanium collar base */}
            <mesh geometry={AMR_GEO.cyl} material={AMR_MAT.lidarBase} scale={[0.22, 0.06, 0.22]} position={[0, 0.03, 0]} />
            {/* 4 mounting base brackets with hex bolts */}
            {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((ang, i) => (
              <mesh
                key={`bclamp_${i}`}
                geometry={AMR_GEO.box}
                material={AMR_MAT.metalTrim}
                position={[Math.cos(ang) * 0.22, 0.03, Math.sin(ang) * 0.22]}
                scale={[0.035, 0.03, 0.035]}
              />
            ))}
            {/* Inner dark sensor cavity */}
            <mesh geometry={AMR_GEO.cyl} material={AMR_MAT.lens} scale={[0.18, 0.08, 0.18]} position={[0, 0.09, 0]} />
            {/* Spinning optical laser sensor inside turret */}
            <group ref={lidarRef} position={[0, 0.09, 0]}>
              <mesh position={[0.13, 0, 0]}>
                <sphereGeometry args={[0.035, 8, 8]} />
                <meshBasicMaterial color="#ffffff" toneMapped={false} />
              </mesh>
            </group>
            {/* Vibrant Anodized Emerald-Green Top Cylinder Cap (Matching Reference Photo) */}
            <mesh
              geometry={AMR_GEO.cyl}
              material={AMR_MAT.lidarCap}
              scale={[0.19, 0.12, 0.19]}
              position={[0, 0.18, 0]}
              castShadow
            />
            {/* Top bevel ring */}
            <mesh
              geometry={AMR_GEO.ring}
              material={AMR_MAT.metalTrim}
              rotation-x={Math.PI / 2}
              position={[0, 0.24, 0]}
              scale={[0.17, 0.17, 0.02]}
            />
          </group>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* Dual Front Projector Headlights                                   */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <mesh position={[hx + 0.02, 0.26, -0.32]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh position={[hx + 0.015, 0.26, -0.32]} rotation-y={Math.PI / 2} material={AMR_MAT.metalTrim}>
            <ringGeometry args={[0.045, 0.062, 16]} />
          </mesh>

          <mesh position={[hx + 0.02, 0.26,  0.32]}>
            <sphereGeometry args={[0.045, 16, 16]} />
            <meshBasicMaterial color="#ffffff" toneMapped={false} />
          </mesh>
          <mesh position={[hx + 0.015, 0.26,  0.32]} rotation-y={Math.PI / 2} material={AMR_MAT.metalTrim}>
            <ringGeometry args={[0.045, 0.062, 16]} />
          </mesh>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* FORWARD HEADLIGHT BEAM & GROUND SAFETY FIELD                     */}
          {/* (Fixed: Radiates directly forward out of the front bumper +X)     */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          <group position={[hx + 0.02, 0.015, 0]}>
            {/* Wide forward safety warning fan */}
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.08, 4.2, 36, 1, -Math.PI / 6, Math.PI / 3]} />
              <meshBasicMaterial
                color={amr.status === 'BLOCKED' ? '#f59e0b' : color}
                transparent
                opacity={amr.status === 'BLOCKED' ? 0.38 : 0.2}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* High-intensity forward headlight pencil beam */}
            <mesh rotation-x={-Math.PI / 2}>
              <ringGeometry args={[0.05, 2.6, 32, 1, -Math.PI / 12, Math.PI / 6]} />
              <meshBasicMaterial
                color="#ffffff"
                transparent
                opacity={0.26}
                depthWrite={false}
                side={THREE.DoubleSide}
              />
            </mesh>

            {/* Forward floor safety distance markers / chevron warning arcs */}
            {[1.4, 2.5, 3.6].map((dist, idx) => (
              <mesh key={`arc_${idx}`} rotation-x={-Math.PI / 2}>
                <ringGeometry args={[dist, dist + 0.045, 32, 1, -Math.PI / 6, Math.PI / 3]} />
                <meshBasicMaterial
                  color={color}
                  transparent
                  opacity={0.42 - idx * 0.1}
                  depthWrite={false}
                  side={THREE.DoubleSide}
                />
              </mesh>
            ))}
          </group>

          {/* Carried Cargo Pod / Pallet when transporting goods */}
          {(amr.currentTask?.toLowerCase().includes('carry') || (amr as any).carrying || amr.status === 'MOVING') && (
            <group position={[-0.1, 0.54, 0]}>
              {/* Pallet base */}
              <mesh position={[0, 0.04, 0]} castShadow>
                <boxGeometry args={[0.82, 0.07, 0.64]} />
                <meshStandardMaterial color="#7c3309" roughness={0.85} />
              </mesh>
              {/* Main cargo box */}
              <mesh position={[-0.05, 0.27, 0]} castShadow>
                <boxGeometry args={[0.54, 0.36, 0.52]} />
                <meshStandardMaterial color="#d97706" roughness={0.65} />
              </mesh>
              {/* Shipping barcode label */}
              <mesh position={[-0.05, 0.27, 0.265]}>
                <planeGeometry args={[0.2, 0.12]} />
                <meshBasicMaterial color="#ffffff" />
              </mesh>
              {/* Side modular pod */}
              <mesh position={[0.25, 0.21, 0.04]} castShadow>
                <boxGeometry args={[0.28, 0.24, 0.38]} />
                <meshStandardMaterial color="#b45309" roughness={0.7} />
              </mesh>
            </group>
          )}

          {/* Rear brake strip */}
          <mesh position={[-hx - 0.02, 0.26, 0]} scale={[0.03, 0.08, 0.62]}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={amr.status === 'BLOCKED' ? '#f59e0b' : '#ef4444'} toneMapped={false} />
          </mesh>

          {/* Floor Neon Underglow Disc */}
          <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
            <circleGeometry args={[1.2, 32]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.25}
              depthWrite={false}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>

        {/* generous invisible hit area so small robots stay clickable at low zoom */}
        <mesh visible={false} position={[0, 0.6, 0]}>
          <cylinderGeometry args={[1.2, 1.2, 1.6, 12]} />
        </mesh>

        {/* selection ring */}
        <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.06} visible={selected}>
          <ringGeometry args={[1.35, 1.6, 48]} />
          <meshBasicMaterial color={AMBER} transparent opacity={0.95} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>

        {/* battery gauge that always faces the camera */}
        <Billboard position={[0, 1.55, 0]}>
          <mesh>
            <planeGeometry args={[1.5, 0.24]} />
            <meshBasicMaterial color="#0b0f14" transparent opacity={0.85} depthWrite={false} />
          </mesh>
          <mesh position={[-0.7 + barW / 2, 0, 0.002]} scale={[barW, 1, 1]}>
            <planeGeometry args={[1, 0.14]} />
            <meshBasicMaterial color={batteryColor(pct)} toneMapped={false} />
          </mesh>
        </Billboard>

        {/* Vertical leader needle from roof to floating badge */}
        <lineSegments position={[0, 0.5, 0]}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[new Float32Array([0, 0, 0, 0, 1.8, 0]), 3]}
            />
          </bufferGeometry>
          <lineBasicMaterial color={selected ? '#38bdf8' : 'rgba(56, 189, 248, 0.45)'} transparent />
        </lineSegments>

        {/* High-Tech Floating Telemetry Callout Badge (matching Image 2) */}
        <Html position={[0, 2.3, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="wh3d-tag flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-mono font-bold tracking-tight shadow-xl border border-cyan-500/40 bg-[#09111c]/90 text-cyan-200">
            <span className="w-2 h-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
            <span>{amr.name ?? amr.id}</span>
            <span className="text-[9.5px] px-1 rounded bg-white/10 text-stone-300">{statusLabel(amr.status)}</span>
            <span className="text-[10px] text-emerald-400 font-extrabold">{Math.round(pct)}%</span>
          </div>
        </Html>
      </group>

      {/* planned route, drawn in world space */}
      {showPath && pathPoints && pathPoints.length > 1 && (
        <Line
          points={pathPoints}
          color={selected ? AMBER : color}
          lineWidth={selected ? 2.5 : 1.2}
          transparent
          opacity={selected ? 0.95 : 0.35}
          dashed={selected}
          dashSize={0.8}
          gapSize={0.5}
        />
      )}
      {showPath && selected && lastPoint && (
        <mesh position={[lastPoint[0], 0.6, lastPoint[2]]}>
          <octahedronGeometry args={[0.45, 0]} />
          <meshStandardMaterial color={AMBER} emissive={AMBER} emissiveIntensity={0.8} />
        </mesh>
      )}
    </>
  );
});

/* -------------------------------------------------------------------------- */
/*  Scene                                                                      */
/* -------------------------------------------------------------------------- */

const EMPTY_NODES: MapNode[] = [];
const EMPTY_EDGES: MapEdge[] = [];
const EMPTY_HAZARDS: Hazard[] = [];

interface SceneProps {
  world: WorldView;
  W: number;
  H: number;
  selectedAmrId: string | null;
  onSelectAmr: (id: string | null) => void;
  onSelectEdge?: (edgeId: string) => void;
  showPaths: boolean;
  showLabels: boolean;
  showGrid: boolean;
  reduceMotion: boolean;
  resetToken: number;
}

function Scene({
  world,
  W,
  H,
  selectedAmrId,
  onSelectAmr,
  onSelectEdge,
  showPaths,
  showLabels,
  showGrid,
  reduceMotion,
  resetToken,
}: SceneProps) {
  const cx = W / 2;
  const cz = H / 2;
  const nodes = world.nodes ?? EMPTY_NODES;
  const edges = world.edges ?? EMPTY_EDGES;
  const hazards = world.hazards ?? EMPTY_HAZARDS;
  const blocked = useMemo(() => new Set(world.blockedEdges ?? []), [world.blockedEdges]);
  const shadowExtent = (W + H) * 0.5;

  return (
    <>
      <color attach="background" args={['#070b12']} />

      <hemisphereLight args={['#38bdf8', '#0b1320', 1.0]} />
      <directionalLight
        position={[40, 70, 30]}
        color="#f0f9ff"
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-left={-shadowExtent}
        shadow-camera-right={shadowExtent}
        shadow-camera-top={shadowExtent}
        shadow-camera-bottom={-shadowExtent}
        shadow-camera-near={1}
        shadow-camera-far={250}
      />

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.12}
        screenSpacePanning={false}
        minZoom={1}
        maxZoom={200}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.3}
        mouseButtons={{
          LEFT: THREE.MOUSE.PAN,
          MIDDLE: THREE.MOUSE.DOLLY,
          RIGHT: THREE.MOUSE.ROTATE,
        }}
        touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}
      />
      <CameraRig W={W} H={H} resetToken={resetToken} />

      <Floor W={W} H={H} showGrid={showGrid} />
      <NodeLayer nodes={nodes} cx={cx} cz={cz} showLabels={showLabels} />
      <Lanes
        nodes={nodes}
        edges={edges}
        blocked={blocked}
        cx={cx}
        cz={cz}
        reduceMotion={reduceMotion}
        onSelectEdge={onSelectEdge}
      />

      {hazards.map((h) => (
        <HazardZone key={h.id} hazard={h} cx={cx} cz={cz} reduceMotion={reduceMotion} />
      ))}

      {world.amrs.map((a) => (
        <AmrMesh
          key={a.id}
          amr={a}
          cx={cx}
          cz={cz}
          selected={a.id === selectedAmrId}
          showPath={showPaths}
          reduceMotion={reduceMotion}
          onSelect={onSelectAmr}
        />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Styles (scoped by the wh3d- prefix)                                        */
/* -------------------------------------------------------------------------- */

const CSS = `
.wh3d{position:relative;width:100%;height:100%;min-height:360px;overflow:hidden;background:#070b12;color:#e2e8f0;
  font-variant-numeric:tabular-nums;--wh-panel:rgba(9,17,28,0.92);--wh-line:rgba(22,40,64,0.95);
  --wh-muted:#8fa0b5;--wh-amber:${AMBER};touch-action:none}
.wh3d:focus-visible{outline:2px solid #38bdf8;outline-offset:-2px}
.wh3d-hud{position:absolute;z-index:30;pointer-events:none;max-width:calc(100% - 24px)}
.wh3d-tl{top:70px;left:16px}
.wh3d-tr{top:70px;right:16px;display:flex;flex-direction:column;gap:6px}
.wh3d-bl{bottom:16px;left:16px}
.wh3d-br{bottom:16px;right:16px}
.wh3d-panel{pointer-events:auto;background:var(--wh-panel)!important;border:1px solid var(--wh-line)!important;
  border-top-color:rgba(56,189,248,0.5)!important;border-radius:12px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  padding:10px 14px;font-size:12px;line-height:1.4;color:#e2e8f0;box-shadow:0 8px 24px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.1)}
.wh3d-title{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:700;color:#38bdf8}
.wh3d-chips{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:8px}
.wh3d-chip{display:inline-flex;align-items:center;gap:6px;color:#cbd5e1;font-weight:600}
.wh3d-dot{width:8px;height:8px;border-radius:50%;flex:none;display:inline-block}
.wh3d-muted{color:var(--wh-muted)}
.wh3d-alerts{margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.1);color:#ffb37a}
.wh3d-btn{pointer-events:auto;width:34px;height:34px;display:grid;place-items:center;cursor:pointer;color:#93a6be;
  background:rgba(10,18,30,0.92)!important;border:1px solid rgba(30,48,72,0.85)!important;border-radius:9px;
  transition:all .2s cubic-bezier(0.16, 1, 0.3, 1);box-shadow:0 4px 12px rgba(0,0,0,0.3)}
.wh3d-btn:hover{background:#132238!important;border-color:#38bdf8!important;color:#fff!important;transform:scale(1.05);box-shadow:0 0 14px rgba(56,189,248,0.4)}
.wh3d-btn:focus-visible{outline:2px solid #38bdf8;outline-offset:2px}
.wh3d-btn[aria-pressed="true"]{color:#fff;border-color:#0ea5e9!important;background:#0284c7!important;box-shadow:0 0 14px rgba(14,165,233,0.5)!important}
.wh3d-detail{width:260px}
.wh3d-row{display:flex;align-items:center;gap:8px}
.wh3d-row strong{flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#fff}
.wh3d-close{width:24px;height:24px;border-radius:6px;box-shadow:none}
.wh3d-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:10px 0 0}
.wh3d-dl dt{color:var(--wh-muted);font-weight:500}
.wh3d-dl dd{margin:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:700;color:#f1f5f9}
.wh3d-track{height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden;margin-top:4px}
.wh3d-fill{height:100%;border-radius:3px;transition:width .3s}
.wh3d-tag{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:11px;padding:4px 9px;color:#e2e8f0;
  background:rgba(9,17,28,0.92)!important;border:1px solid rgba(22,40,64,0.9)!important;border-radius:8px;box-shadow:0 4px 14px rgba(0,0,0,0.5)}
.wh3d-node{white-space:nowrap;font-size:10px;padding:2px 7px;border-radius:6px;color:#94a3b8;background:rgba(9,17,28,0.85)!important;border:1px solid rgba(30,48,72,0.7)!important}
.wh3d-caption{font-size:11px;color:#94a3b8;padding:5px 10px;background:rgba(9,17,28,0.85)!important;border:1px solid rgba(30,48,72,0.7)!important;border-radius:8px}
@media (max-width:520px){.wh3d-detail{width:auto}.wh3d-bl{right:12px}}
`;

/* -------------------------------------------------------------------------- */
/*  Public component                                                           */
/* -------------------------------------------------------------------------- */

export default function WarehouseIsometric3D({
  world,
  selectedAmrId: propSelectedAmrId = null,
  selectedRobotId = null,
  onSelectAmr: propOnSelectAmr,
  onSelectRobot,
  onSelectEdge,
  width = 80,
  height = 50,
  className,
  style,
  isFullscreen = false,
  onToggleFullscreen,
}: WarehouseCanvasProps) {
  const selectedAmrId = propSelectedAmrId ?? selectedRobotId ?? null;
  const onSelectAmr = propOnSelectAmr ?? onSelectRobot;
  const reduceMotion = usePrefersReducedMotion();
  const [showPaths, setShowPaths] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [resetToken, setResetToken] = useState(0);

  const safeWorld = useMemo<WorldView>(() => {
    if (!world) return { timestamp: 0, amrs: [] };
    const rawAmrs = world.amrs ?? world.robots ?? [];
    const amrs: AmrView[] = rawAmrs.map((r: any) => {
      const x = r.x ?? r.pos?.x ?? 0;
      const y = r.y ?? r.pos?.y ?? 0;
      let status: AmrStatus = 'IDLE';
      if (r.status === 'EN_ROUTE' || r.status === 'MOVING') status = 'MOVING';
      else if (r.status === 'CROSSING') status = 'MOVING';
      else if (r.status === 'WAITING' || r.status === 'BLOCKED') status = 'BLOCKED';
      else if (r.status === 'CHARGING') status = 'CHARGING';
      else if (r.status === 'ERROR') status = 'ERROR';
      else if (r.status === 'OFFLINE') status = 'OFFLINE';

      return {
        id: r.id,
        name: r.name ?? r.id,
        status,
        battery: r.battery ?? (r.connected ? 94 : 15),
        speed: r.speed ?? 1.2,
        x,
        y,
        heading: r.heading ?? 0,
        currentTask: r.currentTask ?? (r.carrying ? 'Carrying Pod #84' : 'Awaiting Task'),
        path: r.path ?? r.intent?.map((p: any) => ({ x: p.x, y: p.y })) ?? []
      };
    });

    const rawNodes = world.nodes ?? [];
    const nodes: MapNode[] = rawNodes.map((n: any) => ({
      id: n.id,
      name: n.name ?? n.id,
      x: n.x ?? n.pos?.x ?? 0,
      y: n.y ?? n.pos?.y ?? 0,
      type: n.type ?? n.kind ?? 'waypoint'
    }));

    const rawEdges = world.edges ?? [];
    const edges: MapEdge[] = rawEdges.map((e: any) => ({
      id: e.id,
      source: e.source ?? e.from,
      target: e.target ?? e.to,
      bidirectional: e.bidirectional ?? true
    }));

    return {
      timestamp: world.timestamp ?? Date.now(),
      amrs,
      nodes,
      edges,
      blockedEdges: world.blockedEdges ?? world.blockedEdgeIds ?? [],
      hazards: world.hazards ?? []
    };
  }, [world]);

  const handleSelect = useCallback((id: string | null) => onSelectAmr?.(id), [onSelectAmr]);

  const selected = useMemo(
    () => safeWorld.amrs.find((a) => a.id === selectedAmrId) ?? null,
    [safeWorld.amrs, selectedAmrId],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<AmrStatus, number>> = {};
    for (const a of safeWorld.amrs) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [safeWorld.amrs]);

  const blockedCount = safeWorld.blockedEdges?.length ?? 0;
  const hazardCount = safeWorld.hazards?.length ?? 0;

  return (
    <div
      className={`wh3d${className ? ` ${className}` : ''}`}
      style={style}
      role="region"
      aria-label="Warehouse 3D digital twin"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && selectedAmrId) handleSelect(null);
      }}
    >
      <style>{CSS}</style>

      <Canvas
        orthographic
        shadows
        dpr={[1, 2]}
        camera={{ position: [115, 115, 115], zoom: 8, near: 0.1, far: 1000 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => {
          if (selectedAmrId) handleSelect(null);
        }}
      >
        <Scene
          world={safeWorld}
          W={width}
          H={height}
          selectedAmrId={selectedAmrId}
          onSelectAmr={handleSelect}
          onSelectEdge={onSelectEdge}
          showPaths={showPaths}
          showLabels={showLabels}
          showGrid={showGrid}
          reduceMotion={reduceMotion}
          resetToken={resetToken}
        />
      </Canvas>

      {/* fleet summary, doubles as the status legend */}
      <div className="wh3d-hud wh3d-tl">
        <div className="wh3d-panel">
          <div className="wh3d-title">
            <Bot size={16} aria-hidden />
            <span>
              {safeWorld.amrs.length} {safeWorld.amrs.length === 1 ? 'robot' : 'robots'}
            </span>
          </div>
          <div className="wh3d-chips">
            {STATUS_ORDER.filter((s) => counts[s]).map((s) => (
              <span key={s} className="wh3d-chip">
                <span className="wh3d-dot" style={{ background: STATUS_COLOR[s] }} />
                {counts[s]} {STATUS_LABEL[s].toLowerCase()}
              </span>
            ))}
          </div>
          {(blockedCount > 0 || hazardCount > 0) && (
            <div className="wh3d-alerts">
              {blockedCount > 0 && (
                <div>
                  {blockedCount} blocked {blockedCount === 1 ? 'lane' : 'lanes'}
                </div>
              )}
              {hazardCount > 0 && (
                <div>
                  {hazardCount} active {hazardCount === 1 ? 'hazard' : 'hazards'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* view controls */}
      <div className="wh3d-hud wh3d-tr">
        <button
          type="button"
          className="wh3d-btn"
          aria-pressed={showPaths}
          aria-label="Show planned routes"
          title="Planned routes"
          onClick={() => setShowPaths((v) => !v)}
        >
          <Route size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="wh3d-btn"
          aria-pressed={showLabels}
          aria-label="Show station and charger names"
          title="Station and charger names"
          onClick={() => setShowLabels((v) => !v)}
        >
          <Tag size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="wh3d-btn"
          aria-pressed={showGrid}
          aria-label="Show floor grid"
          title="Floor grid"
          onClick={() => setShowGrid((v) => !v)}
        >
          <LayoutGrid size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="wh3d-btn"
          aria-label="Reset view"
          title="Reset view"
          onClick={() => setResetToken((n) => n + 1)}
        >
          <LocateFixed size={16} aria-hidden />
        </button>
        {onToggleFullscreen && (
          <button
            type="button"
            className="wh3d-btn"
            aria-pressed={isFullscreen}
            aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
            title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            onClick={onToggleFullscreen}
          >
            {isFullscreen ? <Minimize2 size={16} aria-hidden /> : <Maximize2 size={16} aria-hidden />}
          </button>
        )}
      </div>

      {/* selected robot */}
      {selected && (
        <div className="wh3d-hud wh3d-bl">
          <div className="wh3d-panel wh3d-detail">
            <div className="wh3d-row">
              <span className="wh3d-dot" style={{ background: statusColor(selected.status) }} />
              <strong>{selected.name ?? selected.id}</strong>
              <button
                type="button"
                className="wh3d-btn wh3d-close"
                aria-label="Clear selection"
                onClick={() => handleSelect(null)}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
            <dl className="wh3d-dl">
              <dt>Status</dt>
              <dd>{statusLabel(selected.status)}</dd>
              <dt>Battery</dt>
              <dd>{Math.round(clampPct(selected.battery))}%</dd>
            </dl>
            <div className="wh3d-track" aria-hidden>
              <div
                className="wh3d-fill"
                style={{
                  width: `${clampPct(selected.battery)}%`,
                  background: batteryColor(clampPct(selected.battery)),
                }}
              />
            </div>
            <dl className="wh3d-dl">
              <dt>Speed</dt>
              <dd>{selected.speed.toFixed(2)} m/s</dd>
              <dt>Position</dt>
              <dd>
                {selected.x.toFixed(1)}, {selected.y.toFixed(1)} m
              </dd>
              <dt>Task</dt>
              <dd title={selected.currentTask}>{selected.currentTask ?? 'No task'}</dd>
              <dt>Route</dt>
              <dd>
                {selected.path?.length
                  ? `${selected.path.length} ${selected.path.length === 1 ? 'waypoint' : 'waypoints'}`
                  : 'None'}
              </dd>
            </dl>
          </div>
        </div>
      )}

      <div className="wh3d-hud wh3d-br">
        <div className="wh3d-caption">
          {width} × {height} m, grid squares are 5 m
        </div>
      </div>
    </div>
  );
}

export { WarehouseIsometric3D, WarehouseIsometric3D as WarehouseCanvas };
