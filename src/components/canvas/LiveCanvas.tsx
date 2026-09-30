import React, { useState, useEffect, useRef, useCallback } from 'react';
import WarehouseCanvas from '../map/WarehouseCanvas';
import WarehouseIsometric3D from '../map/WarehouseIsometric3D';
import MapControls, { type ScenarioId, type SpeedMultiplier } from '../map/MapControls';
import type { WorldView, AmrView, MapNode, MapEdge, AmrStatus } from '../map/types';

// Default 80m x 50m warehouse roadmap
const INITIAL_NODES: MapNode[] = [
  // Perimeter intersections
  { id: 'n1', pos: { x: 10, y: 10 }, kind: 'junction' },
  { id: 'n2', pos: { x: 40, y: 10 }, kind: 'junction' },
  { id: 'n3', pos: { x: 70, y: 10 }, kind: 'junction' },
  { id: 'n4', pos: { x: 10, y: 25 }, kind: 'aisle' },
  { id: 'n5', pos: { x: 40, y: 25 }, kind: 'junction' }, // 4-way central intersection
  { id: 'n6', pos: { x: 70, y: 25 }, kind: 'aisle' },
  { id: 'n7', pos: { x: 10, y: 40 }, kind: 'junction' },
  { id: 'n8', pos: { x: 40, y: 40 }, kind: 'junction' },
  { id: 'n9', pos: { x: 70, y: 40 }, kind: 'junction' },
  // Pick and Drop bays
  { id: 'p1', pos: { x: 25, y: 10 }, kind: 'pick' },
  { id: 'p2', pos: { x: 55, y: 10 }, kind: 'pick' },
  { id: 'd1', pos: { x: 25, y: 40 }, kind: 'drop' },
  { id: 'd2', pos: { x: 55, y: 40 }, kind: 'drop' },
  // Narrow aisle spur
  { id: 's1', pos: { x: 25, y: 25 }, kind: 'aisle' },
  { id: 's2', pos: { x: 55, y: 25 }, kind: 'aisle' },
  // Charging bays
  { id: 'c1', pos: { x: 10, y: 45 }, kind: 'charge' },
  { id: 'c2', pos: { x: 70, y: 45 }, kind: 'charge' },
];

const INITIAL_EDGES: MapEdge[] = [
  { id: 'e1', from: 'n1', to: 'p1', widthM: 2.2 },
  { id: 'e2', from: 'p1', to: 'n2', widthM: 2.2 },
  { id: 'e3', from: 'n2', to: 'p2', widthM: 2.2 },
  { id: 'e4', from: 'p2', to: 'n3', widthM: 2.2 },
  { id: 'e5', from: 'n1', to: 'n4', widthM: 2.2 },
  { id: 'e6', from: 'n2', to: 'n5', widthM: 2.2 },
  { id: 'e7', from: 'n3', to: 'n6', widthM: 2.2 },
  { id: 'e8', from: 'n4', to: 's1', widthM: 2.2 },
  { id: 'e9', from: 's1', to: 'n5', widthM: 1.6 }, // Narrow aisle
  { id: 'e10', from: 'n5', to: 's2', widthM: 1.6 },
  { id: 'e11', from: 's2', to: 'n6', widthM: 2.2 },
  { id: 'e12', from: 'n4', to: 'n7', widthM: 2.2 },
  { id: 'e13', from: 'n5', to: 'n8', widthM: 2.2 },
  { id: 'e14', from: 'n6', to: 'n9', widthM: 2.2 },
  { id: 'e15', from: 'n7', to: 'd1', widthM: 2.2 },
  { id: 'e16', from: 'd1', to: 'n8', widthM: 2.2 },
  { id: 'e17', from: 'n8', to: 'd2', widthM: 2.2 },
  { id: 'e18', from: 'd2', to: 'n9', widthM: 2.2 },
  { id: 'e19', from: 'n7', to: 'c1', widthM: 2.0 },
  { id: 'e20', from: 'n9', to: 'c2', widthM: 2.0 },
];

const INITIAL_ROBOTS: AmrView[] = [
  {
    id: 'amr_01',
    pos: { x: 18, y: 10 },
    heading: 0,
    speed: 1.2,
    status: 'EN_ROUTE',
    connected: true,
    carrying: true,
    intent: [{ x: 22, y: 10 }, { x: 25, y: 10 }, { x: 30, y: 10 }]
  },
  {
    id: 'amr_02',
    pos: { x: 40, y: 18 },
    heading: Math.PI / 2,
    speed: 1.1,
    status: 'CROSSING',
    connected: true,
    carrying: false,
    intent: [{ x: 40, y: 22 }, { x: 40, y: 25 }, { x: 40, y: 30 }]
  },
  {
    id: 'amr_03',
    pos: { x: 50, y: 25 },
    heading: Math.PI,
    speed: 0.8,
    status: 'WAITING',
    connected: true,
    carrying: true,
    intent: [{ x: 46, y: 25 }, { x: 43, y: 25 }]
  },
  {
    id: 'amr_04',
    pos: { x: 62, y: 40 },
    heading: Math.PI,
    speed: 1.0,
    status: 'EN_ROUTE',
    connected: true,
    carrying: false,
    intent: [{ x: 58, y: 40 }, { x: 55, y: 40 }, { x: 50, y: 40 }]
  }
];

export default function LiveCanvas() {
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState<SpeedMultiplier>(1);
  const [scenario, setScenario] = useState<ScenarioId>('S-C');
  const [seed, setSeed] = useState(42);
  const [pairedLocked, setPairedLocked] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedRobotId, setSelectedRobotId] = useState<string | null>(null);
  const [simTimeS, setSimTimeS] = useState(0);

  const [viewMode, setViewMode] = useState<'3D' | '2D'>('3D');
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Fullscreen change synchronization (supporting native fullscreen and ESC key)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(active);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  const toggleFullscreen = useCallback(async () => {
    try {
      const elem = containerRef.current;
      if (!elem) return;

      const isFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );

      if (!isFs) {
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if ((elem as any).webkitRequestFullscreen) {
          await (elem as any).webkitRequestFullscreen();
        } else if ((elem as any).msRequestFullscreen) {
          await (elem as any).msRequestFullscreen();
        } else {
          setIsFullscreen(true);
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          await (document as any).webkitExitFullscreen();
        } else if ((document as any).msExitFullscreen) {
          await (document as any).msExitFullscreen();
        } else {
          setIsFullscreen(false);
        }
      }
    } catch (err) {
      console.warn('Fullscreen request failed or was dismissed, toggling fallback mode:', err);
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  const [world, setWorld] = useState<WorldView>({
    widthM: 80,
    heightM: 50,
    nodes: INITIAL_NODES,
    edges: INITIAL_EDGES,
    robots: INITIAL_ROBOTS,
    leasedNodeIds: ['n5'],
    contendedNodeIds: ['n2'],
    nominalSpeed: 1.2,
    tick: 0
  });

  // Animation simulation loop
  useEffect(() => {
    if (!running) return;
    const interval = setInterval(() => {
      setSimTimeS((t) => +(t + 0.1 * speed).toFixed(1));
      setWorld((prev) => {
        // Move each robot slightly forward in circuit
        const updatedRobots = prev.robots.map((r, i) => {
          if (r.status === 'WAITING') return r;
          const dt = 0.1 * speed;
          let nx = r.pos.x + Math.cos(r.heading) * r.speed * dt;
          let ny = r.pos.y + Math.sin(r.heading) * r.speed * dt;
          let newHeading = r.heading;

          // Simple warehouse boundaries & turns
          if (nx > 72) { nx = 72; newHeading = Math.PI / 2; }
          else if (nx < 8) { nx = 8; newHeading = -Math.PI / 2; }
          if (ny > 42) { ny = 42; newHeading = Math.PI; }
          else if (ny < 8) { ny = 8; newHeading = 0; }

          return {
            ...r,
            pos: { x: nx, y: ny },
            heading: newHeading,
            intent: [
              { x: nx + Math.cos(newHeading) * 3, y: ny + Math.sin(newHeading) * 3 },
              { x: nx + Math.cos(newHeading) * 6, y: ny + Math.sin(newHeading) * 6 },
              { x: nx + Math.cos(newHeading) * 9, y: ny + Math.sin(newHeading) * 9 },
            ]
          };
        });

        return {
          ...prev,
          robots: updatedRobots,
          tick: prev.tick + 1
        };
      });
    }, 100);

    return () => clearInterval(interval);
  }, [running, speed]);

  const handleReset = useCallback(() => {
    setSimTimeS(0);
    setWorld((prev) => ({
      ...prev,
      robots: INITIAL_ROBOTS,
      tick: 0
    }));
  }, []);

  return (
    <div className="flex flex-col gap-4 w-full">
      <MapControls
        running={running}
        speed={speed}
        scenario={scenario}
        seed={seed}
        pairedLocked={pairedLocked}
        simTimeS={simTimeS}
        showHeatmap={showHeatmap}
        onPlayPause={() => setRunning(!running)}
        onStep={() => {}}
        onReset={handleReset}
        onSpeedChange={setSpeed}
        onScenarioChange={setScenario}
        onSeedChange={setSeed}
        onPairedLockChange={setPairedLocked}
        onToggleHeatmap={() => setShowHeatmap(!showHeatmap)}
      />

      {/* Main Simulation Frame: skin-glass-card container */}
      <div className="skin-glass-card p-4 sm:p-5">
        {/* Sculpted Cyber Command Well wrapping the Digital Twin View (matching Image 2) */}
        <div
          ref={containerRef}
          className={`relative w-full overflow-hidden bg-[#070b12] border border-[#152336] shadow-2xl transition-all ${
            isFullscreen
              ? 'fixed inset-0 z-[9999] w-screen h-screen rounded-none p-3'
              : 'h-[660px] xl:h-[calc(100vh-250px)] min-h-[500px] rounded-2xl p-2.5'
          }`}
        >
          {/* Top Cyber Command Deck Header Bar (matching Image 2) */}
          <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-[#09111c]/90 border border-[#1b2b40] backdrop-blur-md shadow-2xl pointer-events-auto">
            {/* Left: Icon + Title + Subtitle */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-[#0c1f33] border border-[#0ea5e9]/50 shadow-[0_0_12px_rgba(14,165,233,0.35)] flex items-center justify-center text-base font-bold text-[#38bdf8] shrink-0">
                🤖
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-white text-[13px] font-black tracking-wide uppercase font-mono truncate">
                    SwarmEdge Digital Twin <span className="text-[#38bdf8] font-bold">• Real-Time Mesh Twin</span>
                  </h2>
                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-[#0ea5e9]/20 text-[#38bdf8] border border-[#0ea5e9]/40 shrink-0">
                    ZENOH MESH L0
                  </span>
                </div>
                <p className="text-[10px] text-[#7d92a8] font-mono tracking-tight truncate mt-0.5">
                  WH-80×50M Automated Logistical Grid • P2P Anti-Entropy & Conflict-Free Swarm Kinematics
                </p>
              </div>
            </div>

            {/* Right: Telemetry, Full Screen & Mode Switchers */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0e1726] border border-[#1e2d42] text-[11px] font-mono font-semibold text-[#cad6e2]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_6px_#10B981]"></span>
                <span className="text-[#93a6be]">L0 KERNEL</span>
                <span className="text-[10.5px] text-emerald-400 font-bold ml-1">0 FAULTS</span>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0e1726] border border-[#1e2d42] text-[11px] font-mono text-[#cad6e2]">
                <span className="text-cyan-400 font-bold">((o))</span>
                <span className="text-[#93a6be]">ZENOH 0.11</span>
                <span className="text-[10px] text-cyan-400 font-bold">P2P</span>
              </div>

              <button
                type="button"
                onClick={() => setViewMode((m) => (m === '3D' ? '2D' : '3D'))}
                className={`px-3 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer shadow-md flex items-center gap-1.5 ${
                  viewMode === '3D'
                    ? 'bg-[#0284c7] border-[#38bdf8] text-white shadow-[0_0_14px_rgba(2,132,199,0.55)]'
                    : 'bg-[#0e1726] border-[#1e2d42] text-[#93a6be] hover:text-white'
                }`}
                title="Toggle between 3D Isometric Digital Twin and 2D Orthographic Map"
              >
                <span>MODE:</span>
                <span className={viewMode === '3D' ? 'text-amber-200' : 'text-emerald-400'}>
                  {viewMode === '3D' ? '3D TWIN' : '2D MAP'}
                </span>
              </button>

              {/* Full Screen Button (matching Image 2) */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11px] font-mono font-bold border transition-all cursor-pointer shadow-md ${
                  isFullscreen
                    ? 'bg-[#0369a1] border-[#38bdf8] text-white shadow-[0_0_14px_rgba(56,189,248,0.5)]'
                    : 'bg-[#0e1726] border-[#1e2d42] text-[#cad6e2] hover:border-[#38bdf8] hover:text-white hover:shadow-[0_0_12px_rgba(56,189,248,0.35)]'
                }`}
                title={isFullscreen ? 'Exit Full Screen (Esc)' : 'Enter Full Screen'}
              >
                <svg className="w-3.5 h-3.5 text-[#38bdf8]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  {isFullscreen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9L4 4m0 0h4m-4 0v4m11-1l5-5m0 0h-4m4 0v4M9 15l-5 5m0 0h4m-4 0v-4m11 1l5 5m0 0h-4m4 0v-4" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  )}
                </svg>
                <span>{isFullscreen ? 'EXIT FULL SCREEN' : 'FULL SCREEN'}</span>
              </button>
            </div>
          </div>

          {viewMode === '3D' ? (
            <WarehouseIsometric3D
              world={world}
              showHeatmap={showHeatmap}
              selectedRobotId={selectedRobotId}
              onSelectRobot={setSelectedRobotId}
              isFullscreen={isFullscreen}
              onToggleFullscreen={toggleFullscreen}
              style={{ width: '100%', height: '100%', borderRadius: isFullscreen ? 0 : 12 }}
            />
          ) : (
            <WarehouseCanvas
              world={world}
              showHeatmap={showHeatmap}
              selectedRobotId={selectedRobotId}
              onSelectRobot={setSelectedRobotId}
              style={{ width: '100%', height: '100%', borderRadius: isFullscreen ? 0 : 12 }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
