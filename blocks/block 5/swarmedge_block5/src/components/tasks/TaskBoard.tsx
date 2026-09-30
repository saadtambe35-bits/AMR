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
        .se-block5{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color:#e9f0f5;background:#071016;padding:18px;border-radius:20px;box-sizing:border-box}
        .se-head{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px;gap:12px}
        .se-kicker{font-size:10px;letter-spacing:.18em;color:#70a0ad;font-weight:800}
        .se-title{font-size:21px;font-weight:800;letter-spacing:-.02em;margin-top:3px}
        .se-sub{font-size:11px;color:#718690;margin-top:4px}
        .se-grid{display:grid;grid-template-columns:repeat(5,minmax(190px,1fr));gap:10px;overflow-x:auto}
        .se-col{background:#0a151b;border:1px solid #172830;border-radius:15px;padding:9px;min-height:330px;box-shadow:inset 0 1px 0 #1a3039}
        .se-col-head{display:flex;justify-content:space-between;align-items:center;margin:2px 2px 8px}
        .se-col-name{font-size:10px;letter-spacing:.1em;font-weight:800;color:#9db0b7;text-transform:uppercase}
        .se-count{background:#111f26;border:1px solid #21343d;border-radius:99px;padding:2px 7px;font-size:10px;color:#6f8993}
        .se-task{background:linear-gradient(145deg,#122027,#0b161b);border:1px solid #1e333c;border-radius:12px;padding:10px;margin-bottom:8px;box-shadow:0 8px 18px #02060855}
        .se-task-top{display:flex;justify-content:space-between;align-items:center}
        .se-id{font:800 11px ui-monospace,SFMono-Regular,monospace;color:#d9e7eb}
        .se-priority{font-size:8px;font-weight:900;letter-spacing:.08em;padding:3px 6px;border-radius:5px;background:#1b2a31;color:#a9c0c8}
        .se-route{font-size:12px;font-weight:700;margin:9px 0 7px;color:#dce7eb}
        .se-arrow{color:#4f7c88;padding:0 5px}
        .se-meta{display:flex;justify-content:space-between;font-size:9px;color:#6e838c}
        .se-robot{color:#8fc2ce;font-weight:800}
        .se-bar{height:4px;background:#061015;border-radius:99px;overflow:hidden;margin-top:8px}
        .se-fill{height:100%;background:#54b7c8;border-radius:99px}
        .se-bids{margin-top:8px;padding-top:8px;border-top:1px solid #1b2b32}
        .se-bid{display:flex;justify-content:space-between;font-size:9px;padding:3px 0;color:#8499a1}
        .se-bid:first-child{color:#dce9ed}
        .se-bid-cost{font-family:ui-monospace,monospace;color:#8cc8d2}
        .se-fault{border:1px solid #6e3b32}
        .se-fault-btn{margin-top:8px;width:100%;border:1px solid #61382f;background:#251714;color:#eaa899;border-radius:7px;padding:6px;font-size:9px;font-weight:800;cursor:pointer}
        .se-metric{margin-top:12px;max-width:360px}
        .se-reauction-card{background:#0a151b;border:1px solid #172830;border-radius:14px;padding:12px;box-shadow:inset 0 1px 0 #1a3039}
        .se-metric-label{display:flex;justify-content:space-between;font-size:9px;letter-spacing:.12em;color:#75909a;font-weight:800}
        .se-live-dot{color:#70c7a3}.se-metric-value{font:800 29px ui-monospace,monospace;margin:5px 0}.se-metric-value small{font-size:13px;color:#6f858d}
        .se-meter{height:7px;background:#061015;border-radius:99px;position:relative;overflow:hidden}.se-meter-fill{height:100%;background:#66c1cc}.se-meter-target{position:absolute;right:5px;top:9px;font-size:8px;color:#4e6871}
        .se-metric-foot{display:flex;justify-content:space-between;margin-top:18px;font-size:8px;color:#5f747c}.se-good{color:#72cda7}.se-warn{color:#e9a16f}
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
