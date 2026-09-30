// High-fidelity 3D Warehouse Digital Twin with NEXUS-7 Tactical AMRs,
// Industrial Pallet Racking, Dynamic Laser Routes, Conveyor Docking Bays,
// and 100% Native WebGL Billboard Badges & Click-to-Follow Controls.
import React, { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Billboard } from "@react-three/drei";
import * as THREE from "three";
import {
  STATIONS,
  RACKS,
  PRIO_COLOR,
  useStore,
  isLit,
  getRobots,
  getFollow,
  setFollow,
  selectOrder,
  getSelectedStation,
  setSelectedStation,
} from "./orderStore";

/* -------------------------------------------------------------------------- */
/*  Procedural Textures for WebGL Realism (No DOM Elements)                   */
/* -------------------------------------------------------------------------- */

let amrDeckTextureCache = null;
function getAmrDeckTexture() {
  if (!amrDeckTextureCache && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#111a28";
      ctx.fillRect(0, 0, 512, 512);

      // Outer chamfer border
      ctx.strokeStyle = "#243247";
      ctx.lineWidth = 10;
      ctx.strokeRect(16, 16, 480, 480);

      // Inner structural deck panel
      ctx.fillStyle = "#0c131f";
      ctx.fillRect(36, 36, 440, 440);
      ctx.strokeStyle = "rgba(14, 165, 233, 0.4)";
      ctx.lineWidth = 3;
      ctx.strokeRect(36, 36, 440, 440);

      // Yellow/Black diagonal safety chevrons at front
      for (let y = 44; y < 468; y += 32) {
        ctx.fillStyle = "#eab308";
        ctx.beginPath();
        ctx.moveTo(460, y);
        ctx.lineTo(476, y + 16);
        ctx.lineTo(476, y + 32);
        ctx.lineTo(460, y + 16);
        ctx.fill();
      }

      // Tech stencils
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "900 36px -apple-system, sans-serif";
      ctx.fillText("NEXUS-7", 60, 110);

      ctx.fillStyle = "#0ea5e9";
      ctx.font = "bold 18px monospace";
      ctx.fillText("SLAM LiDAR ACTIVE", 60, 140);
      ctx.fillText("LOAD CAP: 1200 KG", 60, 165);

      // Center docking ring
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(256, 256, 100, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#0ea5e9";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(256, 256, 75, 0, Math.PI * 2);
      ctx.stroke();

      // Corner industrial bolt studs
      const bolts = [[50, 50], [462, 50], [50, 462], [462, 462], [256, 50], [256, 462]];
      for (const [bx, by] of bolts) {
        ctx.fillStyle = "#64748b";
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#94a3b8";
        ctx.beginPath();
        ctx.arc(bx, by, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    amrDeckTextureCache = new THREE.CanvasTexture(canvas);
  }
  return amrDeckTextureCache;
}

let crateTextureCache = null;
function getCrateTexture() {
  if (!crateTextureCache && typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.fillStyle = "#92400e";
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = "#78350f";
      ctx.fillRect(10, 10, 236, 236);

      // Wood plank lines
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 4;
      for (let y = 64; y < 256; y += 64) {
        ctx.beginPath();
        ctx.moveTo(10, y);
        ctx.lineTo(246, y);
        ctx.stroke();
      }

      // Barcode shipping label
      ctx.fillStyle = "#f8fafc";
      ctx.fillRect(30, 80, 100, 60);
      ctx.fillStyle = "#0f172a";
      for (let x = 38; x < 120; x += 6) {
        ctx.fillRect(x, 90, 3, 30);
      }
      ctx.font = "bold 9px monospace";
      ctx.fillText("FRAGILE // SIH", 34, 132);

      // Corner metal brackets
      ctx.fillStyle = "#334155";
      const corners = [[10, 10], [226, 10], [10, 226], [226, 226]];
      for (const [cx, cy] of corners) {
        ctx.fillRect(cx, cy, 20, 20);
      }
    }
    crateTextureCache = new THREE.CanvasTexture(canvas);
  }
  return crateTextureCache;
}

const badgeCache = new Map();
function getBadgeTexture(id, text, color, isFollowed) {
  const key = `${id}_${text}_${color}_${isFollowed}`;
  if (badgeCache.has(key)) return badgeCache.get(key);
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Background
  ctx.fillStyle = isFollowed ? "rgba(14, 165, 233, 0.95)" : "rgba(10, 18, 30, 0.9)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(4, 4, 248, 64, 10);
  else ctx.rect(4, 4, 248, 64);
  ctx.fill();

  // Border
  ctx.strokeStyle = isFollowed ? "#ffffff" : color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(4, 4, 248, 64, 10);
  else ctx.rect(4, 4, 248, 64);
  ctx.stroke();

  // Glowing status pip
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(28, 36, 8, 0, Math.PI * 2);
  ctx.fill();

  // Callsign & Status
  ctx.fillStyle = isFollowed ? "#04121c" : "#ffffff";
  ctx.font = "bold 24px monospace";
  ctx.fillText(id, 46, 43);

  ctx.fillStyle = isFollowed ? "#04121c" : "#94a3b8";
  ctx.font = "bold 13px -apple-system, sans-serif";
  ctx.fillText(text, 100, 42);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  badgeCache.set(key, texture);
  return texture;
}

/* -------------------------------------------------------------------------- */
/*  Mecanum Omnidirectional Drive Wheel                                       */
/* -------------------------------------------------------------------------- */

function MecanumWheel({ position, color, flip = false }) {
  return (
    <group position={position}>
      {/* Heavy suspension swing-arm */}
      <mesh position={[0, 0.04, flip ? 0.04 : -0.04]}>
        <boxGeometry args={[0.24, 0.05, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.8} roughness={0.3} />
      </mesh>
      {/* Main Wheel Hub */}
      <mesh rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.09, 0.09, 0.07, 16]} />
        <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.2} />
      </mesh>
      {/* Neon Rim Accent Ring */}
      <mesh rotation-x={Math.PI / 2} position-z={flip ? 0.038 : -0.038}>
        <ringGeometry args={[0.065, 0.085, 16]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  NEXUS-7 AMR Mesh Component                                                */
/* -------------------------------------------------------------------------- */

function AmrGroup({ r, onSelectRobot, robotRef, lidarRef, radarRef, crateRef, auraRef }) {
  const [hovered, setHovered] = useState(false);
  const deckTex = useMemo(() => getAmrDeckTexture(), []);
  const crateTex = useMemo(() => getCrateTexture(), []);
  const followId = getFollow();
  const isFollowed = followId === r.id;

  const isCarrying = !!r.carry;
  const amrColor = isCarrying ? "#10b981" : r.order ? "#0ea5e9" : "#38bdf8";

  const badgeTex = useMemo(() => {
    const text = isCarrying ? "• CARRYING" : r.order ? "• EN ROUTE" : "• STANDBY";
    return getBadgeTexture(r.id, text, amrColor, isFollowed);
  }, [r.id, isCarrying, r.order, amrColor, isFollowed]);

  return (
    <group
      ref={robotRef}
      position={[r.x, 0, r.z]}
      onClick={(e) => {
        e.stopPropagation();
        onSelectRobot(r.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
        setHovered(true);
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
        setHovered(false);
      }}
    >
      {/* Ground Neon Halo Aura */}
      <mesh ref={auraRef} position={[0, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.7, 1.4]} />
        <meshBasicMaterial
          color={amrColor}
          transparent
          opacity={isFollowed ? 0.45 : hovered ? 0.3 : 0.15}
        />
      </mesh>

      {/* Chassis Lower Skid Skirt */}
      <mesh position={[0, 0.07, 0]} castShadow>
        <boxGeometry args={[1.25, 0.08, 0.9]} />
        <meshStandardMaterial color="#0b121c" roughness={0.8} metalness={0.4} />
      </mesh>

      {/* 4 Heavy-duty Mecanum Wheels */}
      <MecanumWheel position={[0.42, 0.11, 0.46]} color={amrColor} flip={false} />
      <MecanumWheel position={[0.42, 0.11, -0.46]} color={amrColor} flip={true} />
      <MecanumWheel position={[-0.42, 0.11, 0.46]} color={amrColor} flip={true} />
      <MecanumWheel position={[-0.42, 0.11, -0.46]} color={amrColor} flip={false} />

      {/* Armored Titanium Hull */}
      <mesh position={[0, 0.24, 0]} castShadow>
        <boxGeometry args={[1.2, 0.26, 0.88]} />
        <meshStandardMaterial color="#151f2e" metalness={0.8} roughness={0.3} />
      </mesh>

      {/* Beveled Hull Chamfer Corners */}
      {[
        [0.54, 0.24, -0.38, Math.PI / 4],
        [0.54, 0.24, 0.38, -Math.PI / 4],
        [-0.54, 0.24, -0.38, -Math.PI / 4],
        [-0.54, 0.24, 0.38, Math.PI / 4],
      ].map(([cx, cy, cz, ry], idx) => (
        <mesh key={idx} position={[cx, cy, cz]} rotation-y={ry}>
          <boxGeometry args={[0.2, 0.262, 0.1]} />
          <meshStandardMaterial color="#1a273b" metalness={0.85} roughness={0.25} />
        </mesh>
      ))}

      {/* Textured Stencil Top Deck Plate */}
      <mesh position={[0, 0.375, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[1.18, 0.86]} />
        <meshStandardMaterial map={deckTex} roughness={0.3} metalness={0.7} />
      </mesh>

      {/* Continuous Wraparound Neon LED Status Ribbon */}
      <mesh position={[0.605, 0.26, 0]}>
        <boxGeometry args={[0.02, 0.04, 0.6]} />
        <meshBasicMaterial color={amrColor} toneMapped={false} />
      </mesh>
      <mesh position={[-0.605, 0.26, 0]}>
        <boxGeometry args={[0.02, 0.04, 0.6]} />
        <meshBasicMaterial color={amrColor} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.26, 0.445]}>
        <boxGeometry args={[0.9, 0.04, 0.02]} />
        <meshBasicMaterial color={amrColor} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.26, -0.445]}>
        <boxGeometry args={[0.9, 0.04, 0.02]} />
        <meshBasicMaterial color={amrColor} toneMapped={false} />
      </mesh>

      {/* Directional Front LED Headlights */}
      <mesh position={[0.61, 0.22, 0.25]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[0.61, 0.22, -0.25]}>
        <sphereGeometry args={[0.04, 12, 12]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>

      {/* Forward Headlight Cones (Volumetric Beams) */}
      <mesh position={[1.4, 0.18, 0.25]} rotation-z={-Math.PI / 2}>
        <coneGeometry args={[0.35, 1.6, 16, 1, true]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={[1.4, 0.18, -0.25]} rotation-z={-Math.PI / 2}>
        <coneGeometry args={[0.35, 1.6, 16, 1, true]} />
        <meshBasicMaterial color="#38bdf8" transparent opacity={0.12} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {/* Central Rotating 360° LiDAR Turret */}
      <group position={[0.1, 0.41, 0]}>
        <mesh>
          <cylinderGeometry args={[0.12, 0.14, 0.08, 20]} />
          <meshStandardMaterial color="#090d16" metalness={0.9} roughness={0.2} />
        </mesh>
        <group ref={lidarRef} position={[0, 0.06, 0]}>
          <mesh>
            <cylinderGeometry args={[0.09, 0.09, 0.07, 16]} />
            <meshStandardMaterial color="#0ea5e9" metalness={0.7} roughness={0.3} emissive="#0ea5e9" emissiveIntensity={0.5} />
          </mesh>
          <mesh position={[0.08, 0, 0]}>
            <boxGeometry args={[0.04, 0.02, 0.04]} />
            <meshBasicMaterial color="#10b981" toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* Rotating LiDAR Radar Scan Sweep Fan */}
      <group ref={radarRef} position={[0.1, 0.44, 0]} rotation-x={-Math.PI / 2}>
        <mesh>
          <circleGeometry args={[1.3, 24, 0, Math.PI / 3]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      </group>

      {/* Carried Cargo Container */}
      <group ref={crateRef} position={[-0.1, 0.68, 0]} visible={isCarrying}>
        <mesh position={[0, -0.24, 0]}>
          <boxGeometry args={[0.85, 0.08, 0.75]} />
          <meshStandardMaterial color="#78350f" roughness={0.9} />
        </mesh>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.8, 0.42, 0.7]} />
          <meshStandardMaterial map={crateTex} roughness={0.7} metalness={0.1} />
        </mesh>
        <mesh position={[-0.2, 0, 0]}>
          <boxGeometry args={[0.03, 0.43, 0.71]} />
          <meshBasicMaterial color="#10b981" toneMapped={false} />
        </mesh>
        <mesh position={[0.2, 0, 0]}>
          <boxGeometry args={[0.03, 0.43, 0.71]} />
          <meshBasicMaterial color="#10b981" toneMapped={false} />
        </mesh>
      </group>

      {/* 100% Native WebGL Floating 3D Billboard Callout Badge */}
      <Billboard position={[0, isCarrying ? 1.45 : 1.05, 0]}>
        <mesh>
          <planeGeometry args={[1.3, 0.38]} />
          <meshBasicMaterial map={badgeTex} transparent toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

function Robots({ onSelectRobot }) {
  const robotRefs = useRef([]);
  const lidarRefs = useRef([]);
  const radarRefs = useRef([]);
  const crateRefs = useRef([]);
  const auraRefs = useRef([]);

  useFrame((_, dt) => {
    const robots = getRobots();
    const followId = getFollow();

    robots.forEach((r, i) => {
      const g = robotRefs.current[i];
      if (!g) return;

      // Smooth position interpolation
      g.position.x = THREE.MathUtils.lerp(g.position.x, r.x, dt * 14);
      g.position.z = THREE.MathUtils.lerp(g.position.z, r.z, dt * 14);

      // Smooth rotation to face travel direction
      if (r.heading !== undefined) {
        const targetRy = -r.heading;
        let diff = targetRy - g.rotation.y;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        g.rotation.y += diff * dt * 12;
      }

      // Spin LiDAR turret
      if (lidarRefs.current[i]) lidarRefs.current[i].rotation.y += dt * 10;
      // Spin Radar sweep fan
      if (radarRefs.current[i]) radarRefs.current[i].rotation.y -= dt * 3.5;

      // Visibility of carried cargo crate
      if (crateRefs.current[i]) crateRefs.current[i].visible = !!r.carry;

      // Pulse aura if followed
      if (auraRefs.current[i]) {
        auraRefs.current[i].scale.setScalar(followId === r.id ? 1.2 : 1);
      }
    });
  });

  return (
    <>
      {getRobots().map((r, i) => (
        <AmrGroup
          key={r.id}
          r={r}
          onSelectRobot={onSelectRobot}
          robotRef={(el) => (robotRefs.current[i] = el)}
          lidarRef={(el) => (lidarRefs.current[i] = el)}
          radarRef={(el) => (radarRefs.current[i] = el)}
          crateRef={(el) => (crateRefs.current[i] = el)}
          auraRef={(el) => (auraRefs.current[i] = el)}
        />
      ))}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Docking Workstations (Pick & Drop Bays)                                   */
/* -------------------------------------------------------------------------- */

function Bay({ s, isSelected, onClick }) {
  const isPick = s.kind === "pick";
  const bayColor = isPick ? "#10b981" : "#0ea5e9";
  const ringRef = useRef();

  useFrame(({ clock }) => {
    const lit = isLit(s.id) || isSelected;
    if (ringRef.current) {
      ringRef.current.scale.setScalar(lit ? 1 + 0.08 * Math.sin(clock.elapsedTime * 6) : 1);
    }
  });

  const badgeTex = useMemo(
    () => getBadgeTexture(s.id, isPick ? "PICK DOCK" : "DROP DOCK", bayColor, isSelected),
    [s.id, isPick, bayColor, isSelected]
  );

  return (
    <group
      position={[s.x, 0, s.z]}
      onClick={(e) => {
        e.stopPropagation();
        onClick(s.id);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "auto";
      }}
    >
      {/* Heavy Steel Docking Base */}
      <mesh position={[0, 0.02, 0]} rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[2.5, 2.5]} />
        <meshStandardMaterial color="#09101c" roughness={0.7} metalness={0.5} />
      </mesh>

      {/* Safety Boundary Perimeter Ring */}
      <mesh ref={ringRef} position={[0, 0.026, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[1.1, 1.25, 32]} />
        <meshBasicMaterial color={bayColor} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>

      {/* Roller Conveyor Transfer Bed */}
      <group position={[0, 0.28, 0]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[2.2, 0.5, 1.4]} />
          <meshStandardMaterial color="#1a2536" roughness={0.4} metalness={0.7} />
        </mesh>
        {/* Conveyor Rollers */}
        {[-0.8, -0.4, 0, 0.4, 0.8].map((rx) => (
          <mesh key={rx} position={[rx, 0.26, 0]} rotation-x={Math.PI / 2} castShadow>
            <cylinderGeometry args={[0.05, 0.05, 1.34, 14]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.9} roughness={0.2} />
          </mesh>
        ))}
        {/* Guard Rails */}
        <mesh position={[0, 0.34, -0.68]}>
          <boxGeometry args={[2.2, 0.12, 0.04]} />
          <meshStandardMaterial color={bayColor} metalness={0.7} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.34, 0.68]}>
          <boxGeometry args={[2.2, 0.12, 0.04]} />
          <meshStandardMaterial color={bayColor} metalness={0.7} roughness={0.3} />
        </mesh>
      </group>

      {/* 3D WebGL Billboard Floating Badge */}
      <Billboard position={[0, 1.9, 0]}>
        <mesh>
          <planeGeometry args={[1.3, 0.38]} />
          <meshBasicMaterial map={badgeTex} transparent toneMapped={false} />
        </mesh>
      </Billboard>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Industrial High-Bay Pallet Storage Racking                                */
/* -------------------------------------------------------------------------- */

const BOX_COLORS = ["#b45309", "#92400e", "#78350f", "#0284c7", "#059669"];

function Rack({ x, z, seed }) {
  const crateTex = useMemo(() => getCrateTexture(), []);
  const palletLoads = useMemo(() => {
    const list = [];
    for (let shelf = 0; shelf < 3; shelf++) {
      for (let bay = 0; bay < 3; bay++) {
        const hash = ((seed * 13 + shelf * 5 + bay * 7) * 0.618) % 1;
        if (hash > 0.1) {
          list.push({
            x: -1.05 + bay * 1.05,
            y: 0.45 + shelf * 0.8,
            w: 0.72 + hash * 0.16,
            h: 0.48 + hash * 0.14,
            d: 0.8,
            color: BOX_COLORS[(seed + shelf + bay) % BOX_COLORS.length],
          });
        }
      }
    }
    return list;
  }, [seed]);

  return (
    <group position={[x, 0, z]}>
      {/* 4 Vertical Steel Uprights (Safety Blue) */}
      {[
        [-1.7, -0.55],
        [1.7, -0.55],
        [-1.7, 0.55],
        [1.7, 0.55],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.25, pz]} castShadow>
          <boxGeometry args={[0.08, 2.5, 0.08]} />
          <meshStandardMaterial color="#0284c7" metalness={0.7} roughness={0.3} />
        </mesh>
      ))}

      {/* Horizontal Safety Load Beams (Industrial Orange) */}
      {[0.32, 1.12, 1.92].map((y) => (
        <group key={y} position={[0, y, 0]}>
          <mesh position={[0, 0, -0.55]} castShadow>
            <boxGeometry args={[3.48, 0.07, 0.05]} />
            <meshStandardMaterial color="#ea580c" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.55]} castShadow>
            <boxGeometry args={[3.48, 0.07, 0.05]} />
            <meshStandardMaterial color="#ea580c" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0.02, 0]}>
            <boxGeometry args={[3.44, 0.02, 1.08]} />
            <meshStandardMaterial color="#334155" metalness={0.6} roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* Pallet Loads with Shipping Labels & Real Box Textures */}
      {palletLoads.map((p, i) => (
        <group key={i} position={[p.x, p.y, 0]}>
          <mesh position={[0, -p.h / 2 + 0.03, 0]}>
            <boxGeometry args={[p.w * 1.05, 0.06, p.d]} />
            <meshStandardMaterial color="#78350f" roughness={0.9} />
          </mesh>
          <mesh castShadow receiveShadow>
            <boxGeometry args={[p.w, p.h, p.d * 0.95]} />
            <meshStandardMaterial
              map={crateTex}
              roughness={0.6}
              metalness={0.2}
              color={p.color}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Dynamic Animated Laser Path Routes                                        */
/* -------------------------------------------------------------------------- */

function Routes() {
  const { orders, selected } = useStore();
  const activeOrders = useMemo(
    () => orders.filter((o) => o.phase !== "DELIVERED"),
    [orders]
  );

  return (
    <>
      {activeOrders.map((o) => {
        const isSel = o.id === selected;
        const color = PRIO_COLOR[o.prio] || "#0ea5e9";
        const points = o.route.map((p) => [p.x, 0.09, p.z]);

        return (
          <group key={o.id}>
            <Line
              points={points}
              color={color}
              lineWidth={isSel ? 5.5 : 2.5}
              transparent
              opacity={isSel ? 1 : 0.65}
            />
            {points.map(([px, py, pz], idx) => (
              <mesh key={idx} position={[px, py + 0.02, pz]}>
                <sphereGeometry args={[isSel ? 0.12 : 0.07, 12, 12]} />
                <meshBasicMaterial color={color} toneMapped={false} />
              </mesh>
            ))}
          </group>
        );
      })}
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Warehouse Floor, Runway Markings, and Atmosphere                          */
/* -------------------------------------------------------------------------- */

function WarehouseFloor() {
  return (
    <group>
      {/* Polished Epoxy Concrete Ground Slab */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01} receiveShadow>
        <planeGeometry args={[24, 18]} />
        <meshStandardMaterial color="#080e18" roughness={0.38} metalness={0.4} />
      </mesh>

      {/* Cyber Grid Lines */}
      <gridHelper
        args={[24, 24, "#1e3452", "#0f1c30"]}
        position-y={0.01}
        scale={[1, 1, 18 / 24]}
      />

      {/* Central High-Speed Aisle Runway Markings */}
      {[-7, -5, -3, -1, 1, 3, 5, 7].map((z) => (
        <mesh key={`cz-${z}`} position={[0, 0.02, z]} rotation-x={-Math.PI / 2}>
          <planeGeometry args={[0.2, 1.2]} />
          <meshBasicMaterial color="#eab308" transparent opacity={0.65} />
        </mesh>
      ))}

      {/* Boundary Laser Perimeter Tape */}
      <mesh position={[0, 0.02, -8.4]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[23.6, 0.15]} />
        <meshBasicMaterial color="#0284c7" />
      </mesh>
      <mesh position={[0, 0.02, 8.4]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[23.6, 0.15]} />
        <meshBasicMaterial color="#0284c7" />
      </mesh>
      <mesh position={[-11.6, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.15, 16.8]} />
        <meshBasicMaterial color="#0284c7" />
      </mesh>
      <mesh position={[11.6, 0.02, 0]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[0.15, 16.8]} />
        <meshBasicMaterial color="#0284c7" />
      </mesh>
    </group>
  );
}

/* -------------------------------------------------------------------------- */
/*  Smooth Camera Rig (Presets & Follow Robot)                                 */
/* -------------------------------------------------------------------------- */

function Rig({ camPreset = "iso" }) {
  const ctl = useRef();
  const v = useMemo(() => new THREE.Vector3(), []);
  const lastPreset = useRef(camPreset);

  useFrame((_, dt) => {
    if (!ctl.current) return;
    const followId = getFollow();

    // Check if preset changed
    if (lastPreset.current !== camPreset) {
      lastPreset.current = camPreset;
      if (camPreset === "top") {
        ctl.current.object.position.set(0, 24, 0.001);
        ctl.current.target.set(0, 0, 0);
      } else {
        ctl.current.object.position.set(16, 15, 16);
        ctl.current.target.set(0, 0, 0);
      }
      ctl.current.update();
      return;
    }

    // Follow active robot smoothly
    if (followId) {
      const robots = getRobots();
      const r = robots.find((bot) => bot.id === followId);
      if (r) {
        v.set(r.x, 0, r.z).sub(ctl.current.target).multiplyScalar(Math.min(1, dt * 8));
        ctl.current.target.add(v);
        ctl.current.object.position.add(v);
        ctl.current.update();
      }
    }
  });

  return (
    <OrbitControls
      ref={ctl}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      maxPolarAngle={1.4}
      minZoom={12}
      maxZoom={100}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Twin3D Export                                                        */
/* -------------------------------------------------------------------------- */

export default function Twin3D({ camPreset = "iso" }) {
  const { selectedStation } = useStore();

  const handleSelectRobot = (id) => {
    const currentFollow = getFollow();
    if (currentFollow === id) {
      setFollow(null);
    } else {
      setFollow(id);
      const r = getRobots().find((b) => b.id === id);
      if (r?.order) selectOrder(r.order);
    }
  };

  const handleSelectStation = (id) => {
    setSelectedStation(id);
  };

  return (
    <Canvas
      orthographic
      camera={{ position: [16, 15, 16], zoom: 28, near: 0.1, far: 250 }}
      style={{ background: "#070b12" }}
      shadows
    >
      <ambientLight intensity={0.8} />
      <directionalLight
        position={[12, 18, 10]}
        intensity={1.4}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0001}
      />
      <directionalLight position={[-12, 12, -8]} intensity={0.5} color="#38bdf8" />
      <pointLight position={[0, 10, 0]} intensity={0.8} color="#0ea5e9" distance={25} />

      {/* Warehouse Infrastructure */}
      <WarehouseFloor />
      {RACKS.map((r, i) => (
        <Rack key={i} {...r} seed={i} />
      ))}
      {STATIONS.map((s) => (
        <Bay
          key={s.id}
          s={s}
          isSelected={selectedStation === s.id}
          onClick={handleSelectStation}
        />
      ))}

      {/* Active Orders & Swarm Fleet */}
      <Routes />
      <Robots onSelectRobot={handleSelectRobot} />

      {/* Camera Rig & Orbit Controls */}
      <Rig camPreset={camPreset} />
    </Canvas>
  );
}
