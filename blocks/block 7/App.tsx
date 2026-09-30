import { useState, type ComponentType } from 'react';
import {
  SloMetricStrip, LiveCanvas, FleetCockpit, ServerKillDuel, ChaosConsole, EdgeProfiler,
} from './integration';
import BenchmarkDashboard from './components/analytics/BenchmarkDashboard';
import AblationMatrix from './components/analytics/AblationMatrix';

const BenchmarksView = () => (
  <div style={{ display: 'grid', gap: 20 }}>
    <BenchmarkDashboard />
    <AblationMatrix />
  </div>
);

const TABS: { id: string; label: string; View: ComponentType }[] = [
  { id: 'map', label: 'Warehouse & Map', View: LiveCanvas },
  { id: 'fleet', label: 'Fleet Cockpit', View: FleetCockpit },
  { id: 'duel', label: 'Server-Kill Duel (S2)', View: ServerKillDuel },
  { id: 'chaos', label: 'Chaos Console (S1)', View: ChaosConsole },
  { id: 'bench', label: 'Benchmarks & Proof (P2)', View: BenchmarksView },
  { id: 'edge', label: 'Edge Profiler (P3)', View: EdgeProfiler },
];

const CSS = `
:root{--sand:#e9dcc6;--sand-deep:#d8c6a5;--ink:#3a2f22;--ink-soft:#6f6150;--accent:#2f6f5e;--warn:#a3562a;
--glass:rgba(255,250,240,.55);--hi:rgba(255,255,255,.75);--lo:rgba(120,95,55,.28)}
@media (prefers-color-scheme:dark){:root{--sand:#2b241b;--sand-deep:#1f1a13;--ink:#f0e6d3;--ink-soft:#b5a78f;
--glass:rgba(60,50,38,.55);--hi:rgba(255,255,255,.06);--lo:rgba(0,0,0,.5);--accent:#5fbf9f;--warn:#e29a6a}}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 700px at 15% -10%,var(--hi),transparent 60%),linear-gradient(160deg,var(--sand),var(--sand-deep));
color:var(--ink);font:15px/1.5 "Avenir Next","Segoe UI",system-ui,sans-serif;min-height:100vh}
h1,h2{font-family:Georgia,"Iowan Old Style",serif;letter-spacing:-.01em}
.se-glass{background:var(--glass);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);
border:1px solid var(--hi);border-radius:22px;box-shadow:8px 8px 20px var(--lo),-6px -6px 16px var(--hi)}
.se-inset{background:rgba(255,255,255,.12);border-radius:14px;box-shadow:inset 3px 3px 8px var(--lo),inset -3px -3px 8px var(--hi)}
.se-broken{outline:2px solid var(--warn);outline-offset:-2px}
.se-muted{color:var(--ink-soft)}
.se-btn{font:inherit;color:var(--ink);background:var(--glass);border:1px solid var(--hi);border-radius:12px;padding:6px 14px;cursor:pointer;
box-shadow:3px 3px 8px var(--lo),-2px -2px 6px var(--hi);transition:box-shadow .15s}
.se-btn:active:not(:disabled){box-shadow:inset 2px 2px 6px var(--lo)}
.se-btn:disabled{opacity:.5;cursor:default}
.se-tab{font:inherit;font-weight:600;color:var(--ink-soft);background:transparent;border:0;border-radius:12px;padding:8px 14px;cursor:pointer;white-space:nowrap;transition:box-shadow .2s,color .2s}
.se-tab[aria-selected=true]{color:var(--ink);background:rgba(255,255,255,.14);box-shadow:inset 3px 3px 7px var(--lo),inset -3px -3px 7px var(--hi)}
.se-tab:focus-visible,.se-btn:focus-visible,input:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
.se-view{animation:se-in .22s ease-out}
@keyframes se-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.se-view{animation:none}*{transition:none!important}}
`;

export default function App() {
  const [tab, setTab] = useState(TABS[0].id);
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const { View } = active;

  return (
    <>
      <style>{CSS}</style>
      <div style={{ maxWidth: 1600, margin: '0 auto', padding: 16, display: 'grid', gap: 14 }}>
        <header className="se-glass" style={{ padding: '12px 18px', display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <h1 style={{ margin: 0, fontSize: 24 }}>SwarmEdge v2</h1>
            <span className="se-inset" title="The ghost node observed traffic but never sent a message"
                  style={{ padding: '4px 12px', fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
              Ghost Node · published: 0
            </span>
          </div>
          <nav role="tablist" aria-label="Views" style={{ display: 'flex', gap: 4, overflowX: 'auto', maxWidth: '100%' }}>
            {TABS.map((t) => (
              <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={t.id === tab}
                      aria-controls="se-panel" className="se-tab" onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
        </header>

        <SloMetricStrip />

        <main id="se-panel" role="tabpanel" aria-labelledby={`tab-${active.id}`} key={active.id} className="se-view">
          <View />
        </main>
      </div>
    </>
  );
}
