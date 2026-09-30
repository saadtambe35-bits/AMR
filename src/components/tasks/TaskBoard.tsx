import React, { useEffect, useMemo, useState } from "react";
import ReAuctionTimer from "./ReAuctionTimer";

export type TaskPhase =
  | "Announced"
  | "Bidding"
  | "In Transit"
  | "Delivered"
  | "Aborted";

export interface Bid {
  robot_id: string;
  dist: number;
  battery: number;
  queue: number;
  cost?: number;
}

export interface Task {
  task_id: string;
  pickup_node: string;
  dropoff_node: string;
  payload_kg: number;
  priority: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  assigned_robot_id?: string;
  phase: TaskPhase;
  bidStartedAt?: number;
  leaseStartedAt?: number;
  leaseRenewedAt?: number;
  bids?: Bid[];
  faultAt?: number;
  reAwardedAt?: number;
}

const seedTasks: Task[] = [
  {
    task_id: "T-1042",
    pickup_node: "A-12",
    dropoff_node: "C-04",
    payload_kg: 8.4,
    priority: "URGENT",
    phase: "Bidding",
    bidStartedAt: Date.now() - 640,
    bids: [
      { robot_id: "R-07", dist: 1.8, battery: 0.19, queue: 1, cost: 2.12 },
      { robot_id: "R-03", dist: 2.4, battery: 0.11, queue: 0, cost: 2.39 },
      { robot_id: "R-11", dist: 3.1, battery: 0.08, queue: 2, cost: 3.46 },
    ],
  },
  {
    task_id: "T-1039",
    pickup_node: "B-03",
    dropoff_node: "D-09",
    payload_kg: 4.1,
    priority: "HIGH",
    phase: "In Transit",
    assigned_robot_id: "R-11",
    leaseStartedAt: Date.now() - 1700,
    leaseRenewedAt: Date.now() - 400,
  },
  {
    task_id: "T-1036",
    pickup_node: "A-02",
    dropoff_node: "B-08",
    payload_kg: 2.8,
    priority: "NORMAL",
    phase: "Announced",
  },
  {
    task_id: "T-1031",
    pickup_node: "D-02",
    dropoff_node: "A-01",
    payload_kg: 11.2,
    priority: "HIGH",
    phase: "Delivered",
    assigned_robot_id: "R-04",
  },
  {
    task_id: "T-1028",
    pickup_node: "C-10",
    dropoff_node: "C-02",
    payload_kg: 1.7,
    priority: "LOW",
    phase: "Aborted",
    assigned_robot_id: "R-02",
  },
];

const columns: TaskPhase[] = [
  "Announced",
  "Bidding",
  "In Transit",
  "Delivered",
  "Aborted",
];

function costOf(b: Bid) {
  return b.cost ?? 0.55 * b.dist + 0.3 * b.battery + 0.15 * b.queue;
}

export interface TaskBoardProps {
  initialTasks?: Task[];
  onInjectFault?: (task: Task) => void;
}

export function TaskBoard({
  initialTasks = seedTasks,
  onInjectFault,
}: TaskBoardProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [now, setNow] = useState(Date.now());
  const [faultTask, setFaultTask] = useState<Task | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(id);
  }, []);

  const grouped = useMemo(
    () =>
      Object.fromEntries(
        columns.map((phase) => [phase, tasks.filter((t) => t.phase === phase)])
      ) as Record<TaskPhase, Task[]>,
    [tasks]
  );

  const triggerFault = (task: Task) => {
    const faultAt = Date.now();
    const faulted = { ...task, phase: "Aborted" as TaskPhase, faultAt };
    setTasks((current) =>
      current.map((t) => (t.task_id === task.task_id ? faulted : t))
    );
    setFaultTask(faulted);
    onInjectFault?.(faulted);

    window.setTimeout(() => {
      const reAwardedAt = Date.now();
      setTasks((current) =>
        current.map((t) =>
          t.task_id === task.task_id
            ? {
                ...t,
                phase: "Bidding",
                bidStartedAt: reAwardedAt,
                faultAt,
                reAwardedAt,
                bids: t.bids,
              }
            : t
        )
      );
    }, 1400);
  };

  return (
    <section className="se-block5">
      <style>{`
        .se-block5{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#231f1c;background:linear-gradient(135deg, rgba(255, 255, 255, 0.82) 0%, rgba(255, 255, 255, 0.45) 60%, rgba(245, 243, 236, 0.35) 100%) !important;backdrop-filter:blur(28px) saturate(160%) !important;-webkit-backdrop-filter:blur(28px) saturate(160%) !important;padding:20px;border-radius:18px;box-sizing:border-box;border:1px solid rgba(255,255,255,0.88) !important;box-shadow:0 20px 40px -15px rgba(135, 120, 100, 0.16), 0 6px 14px -4px rgba(135, 120, 100, 0.08), inset 0 1px 2px rgba(255, 255, 255, 0.98), inset 0 -1px 2px rgba(180, 165, 145, 0.12) !important;position:relative;}
        .se-block5::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg, transparent 2%, rgba(255,255,255,0.4) 15%, rgba(255,255,255,1) 50%, rgba(255,255,255,0.4) 85%, transparent 98%) !important;filter:drop-shadow(0 1px 1px rgba(255, 255, 255, 0.8));pointer-events:none;border-radius:18px 18px 0 0;}
        .se-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px;gap:12px}
        .se-kicker{font-size:10px;letter-spacing:.16em;color:#0284c7;font-weight:800;text-transform:uppercase}
        .se-title{font-size:21px;font-weight:900;letter-spacing:-.02em;color:#231f1c;margin-top:3px}
        .se-sub{font-size:12px;color:#57534e;margin-top:4px;font-weight:500}
        .se-grid{display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:10px;overflow-x:auto}
        .se-col{background:#eae5d9 !important;border:1px solid rgba(255, 255, 255, 0.6) !important;border-top-color:rgba(160, 148, 130, 0.28) !important;border-left-color:rgba(160, 148, 130, 0.22) !important;border-radius:14px;padding:10px;min-height:330px;box-shadow:inset 3px 3px 6px rgba(150, 138, 120, 0.25), inset -2px -2px 5px rgba(255, 255, 255, 0.92) !important;}
        .se-col-head{display:flex;justify-content:space-between;align-items:center;margin:2px 2px 8px}
        .se-col-name{font-size:10px;letter-spacing:.1em;font-weight:800;color:#57534e;text-transform:uppercase}
        .se-count{background:linear-gradient(160deg, #241d18 0%, #16120f 100%) !important;border:1px solid rgba(217, 180, 150, 0.35) !important;box-shadow:0 2px 6px rgba(0, 0, 0, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.15) !important;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;color:rgba(235, 220, 200, 0.92);font-family:ui-monospace,"JetBrains Mono",monospace;text-shadow:0 1px 2px rgba(0,0,0,0.6);}
        .se-task{background:linear-gradient(135deg, rgba(255, 255, 255, 0.92) 0%, rgba(255, 255, 255, 0.72) 100%);border:1px solid rgba(255,255,255,0.98);border-radius:12px;padding:11px;margin-bottom:9px;box-shadow:0 4px 12px rgba(150, 135, 115, 0.12), inset 0 1px 1px #fff;transition:transform 0.15s ease,box-shadow 0.15s ease,border-color 0.15s ease}
        .se-task:hover{border-color:rgba(180, 170, 155, 0.95);transform:translateY(-2px);box-shadow:0 8px 18px rgba(150, 135, 115, 0.18), inset 0 1px 1px #fff}
        .se-task-top{display:flex;justify-content:space-between;align-items:center}
        .se-id{font:800 11px ui-monospace,"JetBrains Mono",monospace;color:#231f1c;letter-spacing:0.02em}
        .se-priority{font-size:8px;font-weight:900;letter-spacing:.08em;padding:3px 6px;border-radius:5px;background:rgba(217,119,6,0.12);border:1px solid rgba(217,119,6,0.3);color:#b45309}
        .se-route{font-size:12px;font-weight:700;margin:9px 0 7px;color:#231f1c}
        .se-arrow{color:#d97706;padding:0 5px}
        .se-meta{display:flex;justify-content:space-between;font-size:9.5px;color:#57534e;font-weight:500}
        .se-robot{color:#0284c7;font-weight:800;font-family:ui-monospace,"JetBrains Mono",monospace}
        .se-bar{height:6px;background:#eae5d9;border-radius:99px;overflow:hidden;margin-top:8px;border:1px solid rgba(255, 255, 255, 0.6);border-top-color:rgba(160, 148, 130, 0.25);box-shadow:inset 1px 1px 3px rgba(150, 138, 120, 0.25)}
        .se-fill{height:100%;background:linear-gradient(90deg,#10b981,#0ea5e9);border-radius:99px;box-shadow:0 0 6px rgba(16,185,129,0.5)}
        .se-bids{margin-top:8px;padding-top:8px;border-top:1px solid rgba(215, 208, 195, 0.6)}
        .se-bid{display:flex;justify-content:space-between;font-size:9px;padding:3px 0;color:#57534e}
        .se-bid:first-child{color:#059669;font-weight:700}
        .se-bid-cost{font-family:ui-monospace,"JetBrains Mono",monospace;color:#57534e}
        .se-fault{border:1px solid rgba(239,68,68,0.4);background:linear-gradient(180deg,rgba(254,242,242,0.95),rgba(255,255,255,0.85));box-shadow:0 4px 14px rgba(239,68,68,0.12), inset 0 1px 1px #fff}
        .se-fault-btn{margin-top:8px;width:100%;border:1px solid rgba(239,68,68,0.3);background:rgba(239,68,68,0.08);color:#b91c1c;border-radius:8px;padding:7px;font-size:9.5px;font-weight:800;cursor:pointer;letter-spacing:0.03em;transition:all 0.15s ease;box-shadow:inset 0 1px 0 rgba(255,255,255,0.8)}
        .se-fault-btn:hover{background:rgba(239,68,68,0.16);border-color:rgba(239,68,68,0.5);box-shadow:0 2px 8px rgba(239,68,68,0.2)}
        .se-fault-btn:active{transform:translateY(1px)}
        .se-metric{margin-top:14px;max-width:400px}
        .se-reauction-card{background:linear-gradient(135deg, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.65) 100%);border:1px solid rgba(255,255,255,0.95);border-radius:14px;padding:14px;box-shadow:0 4px 14px rgba(150, 135, 115, 0.12), inset 0 1px 1px #fff}
        .se-metric-label{display:flex;justify-content:space-between;font-size:9.5px;letter-spacing:.14em;color:#57534e;font-weight:800;text-transform:uppercase}
        .se-live-dot{color:#059669;font-weight:800;display:inline-flex;align-items:center;gap:5px}
        .se-live-dot::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;background:radial-gradient(circle at 35% 35%, #ffffff 0%, #10b981 55%, #064e3b 100%);box-shadow:0 0 8px #10b981, 0 0 16px #10b981}
        .se-metric-value{font:900 32px ui-monospace,"JetBrains Mono",monospace;color:#231f1c;font-variant-numeric:tabular-nums;margin:6px 0}
        .se-metric-value small{font-size:15px;color:#57534e;margin-left:3px}
        .se-meter{height:8px;background:#eae5d9;border-radius:99px;position:relative;overflow:hidden;border:1px solid rgba(255,255,255,0.6);border-top-color:rgba(160,148,130,0.25);box-shadow:inset 1px 1px 3px rgba(150, 138, 120, 0.25)}
        .se-meter-fill{height:100%;background:linear-gradient(90deg,#10b981,#0ea5e9);border-radius:99px;box-shadow:0 0 10px rgba(16,185,129,0.5)}
        .se-meter-target{position:absolute;right:6px;top:10px;font-size:8.5px;color:#57534e;font-family:ui-monospace,"JetBrains Mono",monospace}
        .se-metric-foot{display:flex;justify-content:space-between;margin-top:18px;font-size:9px;color:#57534e;font-family:ui-monospace,"JetBrains Mono",monospace}
        .se-good{color:#059669;font-weight:800}
        .se-warn{color:#d97706;font-weight:800}
        @media(max-width:1050px){.se-grid{grid-template-columns:repeat(5,205px)}}
      `}</style>

      <div className="se-head">
        <div>
          <div className="se-kicker">BLOCK 5 / C6 · CONTRACT NET</div>
          <div className="se-title">Task Allocation Board</div>
          <div className="se-sub">Announce → bid → lease → delivery · decentralized re-auction on fault</div>
        </div>
      </div>

      <div className="se-grid">
        {columns.map((phase) => (
          <div className="se-col" key={phase}>
            <div className="se-col-head">
              <span className="se-col-name">{phase}</span>
              <span className="se-count">{grouped[phase].length}</span>
            </div>

            {grouped[phase].map((task) => {
              const bidElapsed = task.bidStartedAt
                ? Math.max(0, now - task.bidStartedAt) / 1000
                : 0;
              const bidRemaining = Math.max(0, 1 - bidElapsed);
              const leaseElapsed = task.leaseStartedAt
                ? Math.max(0, now - task.leaseStartedAt) / 1000
                : 0;
              const leaseRemaining = Math.max(0, 3 - leaseElapsed);
              const bids = [...(task.bids ?? [])].sort(
                (a, b) => costOf(a) - costOf(b)
              );

              return (
                <article
                  className={`se-task ${task.phase === "Aborted" ? "se-fault" : ""}`}
                  key={task.task_id}
                >
                  <div className="se-task-top">
                    <span className="se-id">{task.task_id}</span>
                    <span className="se-priority">{task.priority}</span>
                  </div>

                  <div className="se-route">
                    {task.pickup_node}
                    <span className="se-arrow">→</span>
                    {task.dropoff_node}
                  </div>

                  <div className="se-meta">
                    <span>{task.payload_kg.toFixed(1)} kg</span>
                    <span className="se-robot">
                      {task.assigned_robot_id ?? "UNASSIGNED"}
                    </span>
                  </div>

                  {task.phase === "Bidding" && (
                    <>
                      <div className="se-bar">
                        <div
                          className="se-fill"
                          style={{ width: `${bidRemaining * 100}%` }}
                        />
                      </div>
                      <div className="se-meta" style={{ marginTop: 4 }}>
                        <span>BID WINDOW</span>
                        <span>{bidRemaining.toFixed(2)}s</span>
                      </div>
                      <div className="se-bids">
                        {bids.map((bid) => (
                          <div className="se-bid" key={bid.robot_id}>
                            <span>{bid.robot_id}</span>
                            <span className="se-bid-cost">
                              cost={costOf(bid).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {task.phase === "In Transit" && (
                    <>
                      <div className="se-bar">
                        <div
                          className="se-fill"
                          style={{ width: `${(leaseRemaining / 3) * 100}%` }}
                        />
                      </div>
                      <div className="se-meta" style={{ marginTop: 4 }}>
                        <span>LEASE TTL</span>
                        <span>{leaseRemaining.toFixed(1)}s</span>
                      </div>
                      <button
                        className="se-fault-btn"
                        onClick={() => triggerFault(task)}
                      >
                        SIMULATE ROBOT FAULT → RE-AUCTION
                      </button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        ))}
      </div>

      <div className="se-metric">
        <ReAuctionTimer
          faultAt={faultTask?.faultAt}
          awardedAt={faultTask?.reAwardedAt}
          lastLatencySeconds={1.42}
        />
      </div>
    </section>
  );
}

export default TaskBoard;
