import { useState, type ComponentType } from 'react';
import {
  LayoutGrid,
  Bot,
  Zap,
  Flame,
  Boxes,
  BarChart3,
  Activity,
  Network,
  Sparkles,
  GitBranch,
} from 'lucide-react';
import {
  SloMetricStrip, LiveCanvas, FleetCockpit, ServerKillDuel, ChaosConsole, EdgeProfiler,
} from './integration';
import BenchmarkDashboard from './components/analytics/BenchmarkDashboard';
import AblationMatrix from './components/analytics/AblationMatrix';
import TaskBoard from './components/tasks/TaskBoard';
import HazardGossipFeed from './components/profiler/HazardGossipFeed';
import OpticalLedPip from './components/common/OpticalLedPip';
import CockpitChip from './components/common/CockpitChip';

// Newly Ingested Master Blocks
import { LanguageToggle, OfflineIndicator, MeshTopologyPanel } from './components/blocks/block1/Block1';
import SwarmEdgeBlock2Demo from './components/blocks/block2/SwarmEdgeBlock2';
import SwarmEdgeBlock3Demo from './components/blocks/block3/SwarmEdgeBlock3';
import WmsTwinStudio from './components/blocks/block4/WmsTwinStudio';

const BenchmarksView = () => (
  <div style={{ display: 'grid', gap: 20 }}>
    <BenchmarkDashboard />
    <AblationMatrix />
  </div>
);

const TasksHazardsView = () => (
  <div className="flex flex-col gap-5 w-full">
    <TaskBoard />
    <HazardGossipFeed />
  </div>
);

interface TabItem {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  badge?: string;
  View: ComponentType;
}

const TABS: TabItem[] = [
  { id: 'map', label: 'warehouse', icon: LayoutGrid, badge: '3D/2D Live', View: LiveCanvas },
  { id: 'mesh', label: 'mesh topology', icon: Network, badge: 'P2P Proof', View: MeshTopologyPanel },
  { id: 'timeline', label: 'timeline & esg', icon: Activity, badge: 'Gantt+CO2', View: SwarmEdgeBlock2Demo },
  { id: 'whatif', label: 'what-if & ai', icon: Sparkles, badge: 'A* Co-Pilot', View: SwarmEdgeBlock3Demo },
  { id: 'orders', label: 'wms & orders', icon: Boxes, badge: 'SLA Feed', View: WmsTwinStudio },
  { id: 'fleet', label: 'fleet', icon: Bot, badge: '4 online', View: FleetCockpit },
  { id: 'duel', label: 'server-kill', icon: Zap, badge: 'S2 Duel', View: ServerKillDuel },
  { id: 'chaos', label: 'chaos console', icon: Flame, badge: 'S1', View: ChaosConsole },
  { id: 'tasks', label: 'tasks & gossip', icon: GitBranch, badge: 'L2', View: TasksHazardsView },
  { id: 'bench', label: 'benchmarks', icon: BarChart3, badge: 'P2 Proof', View: BenchmarksView },
  { id: 'edge', label: 'edge profiler', icon: Activity, badge: 'P3 Perf', View: EdgeProfiler },
];

const CSS = `
:root {
  --bg-sandstone: #ece7dc;
  --stone-text-main: #2b2621;
  --stone-text-sub: #6e675f;
  --ink: #2b2621;
  --ink-soft: #6e675f;
  --ink-muted: #8f887f;
  --accent: #10b981;
  --warn: #f59e0b;
  --danger: #ef4444;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background-color: var(--bg-sandstone);
  color: var(--stone-text-main);
  background-image: 
    radial-gradient(at 100% 0%, rgba(255, 255, 255, 0.4) 0px, transparent 50%),
    radial-gradient(at 0% 100%, rgba(215, 200, 180, 0.3) 0px, transparent 50%);
  background-attachment: fixed;
  font: 14.5px/1.5 "Inter", ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.015em;
  min-height: 100vh;
}

h1, h2, h3 {
  font-family: "Inter", system-ui, sans-serif;
  letter-spacing: -0.025em;
  color: var(--stone-text-main);
}

.se-tab {
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  color: #2b2621;
  border-radius: 10px;
  padding: 6px 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.se-tab[aria-selected=true] {
  color: #2b2621;
  background: #e3ded2 !important;
  border: 1px solid rgba(255, 255, 255, 0.5) !important;
  border-top-color: rgba(140, 125, 105, 0.3) !important;
  border-left-color: rgba(140, 125, 105, 0.24) !important;
  box-shadow: inset 3px 3px 6px rgba(130, 115, 95, 0.22), inset -2px -2px 5px rgba(255, 255, 255, 0.95), 0 1px 2px rgba(255, 255, 255, 0.75) !important;
  font-weight: 700;
  transform: none;
}

.se-tab:focus-visible {
  outline: 2px solid #0ea5e9;
  outline-offset: 2px;
}

.se-view {
  animation: se-in 180ms ease-out;
}

@keyframes se-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: none; }
}

@media (prefers-reduced-motion: reduce) {
  .se-view { animation: none; }
  * { transition: none !important; }
}
`;

export default function App() {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const { View } = active;

  return (
    <>
      <style>{CSS}</style>

      {/* 1. Ambient atmospheric background glow orbs for physical glass refraction */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden" aria-hidden="true">
        {/* Warm Amber/Gold ambient aura */}
        <div className="absolute -top-[10%] left-[15%] w-[600px] h-[600px] rounded-full bg-[#f59e0b]/20 blur-[130px]"></div>
        {/* Soft Terracotta / Clay glow */}
        <div className="absolute top-[35%] right-[10%] w-[550px] h-[550px] rounded-full bg-[#ea580c]/14 blur-[120px]"></div>
        {/* Pale Warm Azure / Sky edge accent */}
        <div className="absolute -bottom-[10%] left-[25%] w-[700px] h-[500px] rounded-full bg-[#0284c7]/12 blur-[140px]"></div>
      </div>

      <div className="relative z-10 max-w-[1780px] mx-auto p-3 sm:p-5 flex flex-col md:flex-row gap-4 sm:gap-5 items-start">
        {/* ========================================================= */}
        {/* LEFT VERTICAL SIDEBAR (Image 2 Reference Style)           */}
        {/* ========================================================= */}
        <aside className="w-full md:w-[270px] lg:w-[290px] shrink-0 flex flex-col gap-3">
          {/* 1. Header / Logo Card */}
          <div className="skin-glass-card p-3.5 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-100 to-amber-200/80 border border-white/90 shadow-sm flex items-center justify-center text-xl shrink-0">
              🤖
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[#2b2621] font-black text-[17px] tracking-tight">SwarmEdge</span>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10B981] shrink-0"></span>
              </div>
              <p className="text-[10px] font-extrabold tracking-wider text-stone-500 uppercase mt-0.5 truncate">
                Decentralized Fleet AI
              </p>
            </div>
          </div>

          {/* 2. System Context Card */}
          <div className="skin-glass-card p-3 flex flex-col gap-1.5 text-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-stone-800 font-mono text-[11px] font-bold">
                <span className="text-emerald-600">((o))</span> amr_mesh_zenoh
              </div>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/15 text-emerald-900 border border-emerald-500/30">
                P2P / MESH
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-stone-600 font-medium pt-0.5">
              <span>4 Nodes • Brokerless</span>
              <span className="flex items-center gap-1 font-mono text-[10.5px] font-bold text-stone-700">
                <span className="text-emerald-600">✓</span> SIL-4 Kernel
              </span>
            </div>
          </div>

          {/* 3. Section Title */}
          <div className="px-1 pt-1">
            <span className="text-[10.5px] font-extrabold tracking-widest text-stone-500 uppercase">
              Navigation
            </span>
          </div>

          {/* 4. Vertical Navigation Pills Stack */}
          <nav role="tablist" aria-label="Fleet Views" className="flex flex-col gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const isSelected = t.id === tab;
              return (
                <button
                  key={t.id}
                  role="tab"
                  id={`tab-${t.id}`}
                  aria-selected={isSelected}
                  aria-controls="se-panel"
                  className={`nav-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="nav-pill-icon shrink-0">
                      <Icon size={17} strokeWidth={isSelected ? 2.5 : 2} />
                    </span>
                    <span className="truncate">{t.label}</span>
                  </div>
                  {t.badge && (
                    <span className="nav-pill-badge shrink-0">
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* 5. Bottom System Status Card */}
          <div className="skin-glass-card p-3 flex flex-col gap-2 mt-auto">
            <div className="flex items-center justify-between text-xs">
              <span className="text-stone-600 font-semibold text-[11.5px]">L0 Safety Guard</span>
              <span className="cockpit-dark-chip text-[10px] !py-0.5 !px-2 border-emerald-500/40 shadow-[0_0_10px_rgba(16,185,129,0.25)]">
                ACTIVE 9.8
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-stone-500 font-mono">
              <span>Collision Guard</span>
              <span className="text-stone-800 font-bold">0 Violations</span>
            </div>
          </div>
        </aside>

        {/* ========================================================= */}
        {/* RIGHT MAIN CONTENT AREA                                   */}
        {/* ========================================================= */}
        <div className="flex-1 min-w-0 w-full flex flex-col gap-3.5">
          {/* Top Bar with Ghost-Node & Status Telemetry */}
          <header className="skin-glass-card specular-sheen p-3 sm:px-4 sm:py-2.5 flex flex-wrap gap-3 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="cockpit-dark-chip text-[11px]">
                <span className="led-jewel led-jewel-emerald"></span>
                <span>GHOST-NODE · PUBLISHED: 0</span>
              </div>
              <span className="hidden sm:inline text-xs text-[#6e675f] font-medium tracking-tight">
                Peer-to-Peer Contract-Net & Anti-Entropy Hazard Gossip
              </span>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Block 1: Offline-First PWA Status Badge */}
              <OfflineIndicator />

              {/* Block 1: Hindi / Marathi / English Regional Switcher */}
              <LanguageToggle />

              <div className="cockpit-dark-chip text-[11px]">
                <span className="led-jewel led-jewel-emerald"></span>
                <span>ZENOH 0.11.0</span>
              </div>
              <div className="hidden lg:inline-flex cockpit-dark-chip text-[11px]">
                <span className="text-stone-300 font-mono">ZERO COLLISION HOLDING</span>
              </div>
            </div>
          </header>

          {/* Global SLO Metric Strip */}
          <SloMetricStrip />

          {/* Active View Container */}
          <main id="se-panel" role="tabpanel" aria-labelledby={`tab-${active.id}`} key={active.id} className="se-view">
            <View />
          </main>
        </div>
      </div>
    </>
  );
}
