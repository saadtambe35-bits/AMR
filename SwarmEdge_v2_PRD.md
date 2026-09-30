# SwarmEdge v2 — Product Requirements & System Architecture

**Project:** SwarmEdge — Decentralized Edge-AI Fleet Coordination for AMRs in Smart Warehouses
**Target:** Smart India Hackathon — Edge-AI Distributed Fleet Coordination problem statement
**Timeline:** 20 days to demo-ready MVP
**Companion files:** `swarmedge_contracts.proto` (message contracts), `SwarmEdge_v2_Demo_and_Judge_Playbook.md` (demo script, Q&A, slides)

> Numeric values marked **[start]** are starting parameters to be tuned. Numbers marked **[target]** are goals to be validated by measurement. **No result in this document is a measured result.** Never put an unmeasured number on a slide.

---

## 0. The one-sentence thesis

> **Remove the server, the Wi-Fi, or a robot — the fleet keeps working with zero collisions.**

Every feature exists to support, prove, or demonstrate this sentence. Anything that does not is cut (Section 16).

---

## 1. Problem-statement traceability

| PS requirement | Mechanism in SwarmEdge | Proof artifact |
|---|---|---|
| ≥ 3 AMRs, on edge hardware | Each robot = separate OS process, resource-capped to Pi-class; ≥ 1 real Pi/Jetson in the mesh if obtainable | Edge profiler report (P3); hardware-in-the-loop clip |
| Decentralized communication, no central server | Brokerless Zenoh peer mesh, zone-sharded topics, Protobuf | Ghost-node observer with "packets published: 0" (P1); Server-Kill Duel (S2) |
| Dynamic conflict resolution / deadlocks at choke points | L0 Safety Kernel + L1 lease negotiation + deadlock escape ladder | 0 collisions across N seeded episodes; ablations (Section 13.6) |
| Task allocation and re-routing on blocked aisle | Contract Net with task leases, hazard gossip, roadmap re-plan | Blocked-aisle and robot-failure scenarios; re-auction latency metric |
| Fleet dashboard: positions + battery | Passive observer dashboard, heatmap, Chaos Console | Live demo |
| Zero collisions | Safety Kernel + logged min-separation + fault injection | Proof Matrix (Section 13.7) |
| ≥ 20% reduction in completion time vs stop-and-wait | Benchmark harness, 3 systems, paired seeds | Benchmark report with CI (Section 13) |

---

## 2. Architecture

```
                 ┌──────────────────────────────────────────────┐
                 │   GHOST-NODE OBSERVER (subscribe-only)        │
                 │   Dashboard · Heatmap · Profiler · SLO strip  │
                 │   publish counter must read 0                 │
                 └───────────────────────▲──────────────────────┘
                                         │ subscribe swarm/**
═════════════════════════════════════════╧═════════════════════════════════════
   ZENOH PEER MESH  (brokerless, multicast scouting, zone-sharded topics)
═════════════════════════════════════════╤═════════════════════════════════════
        ┌───────────────┬────────────────┴───────┬────────────────┐
        │   AMR-01      │   AMR-02      ...      │    AMR-N       │   (separate OS processes;
        │   process     │   process              │    process     │    optional real Pi/Jetson)
        └───────────────┴────────────────────────┴────────────────┘

  PER-ROBOT PROCESS
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ L2  TASKS        CNP bidding · task leases · fault re-auction            │
  │ L1  NEGOTIATION  lease-based right-of-way · bids w/ aging · N-way queue  │
  │ L0  SAFETY       ORCA · stopping envelope · silent-peer inflation        │  ◄ never negotiates
  │ ───────────────────────────────────────────────────────────────────────  │
  │ PLAN   roadmap graph · A* · time-window reservations · re-plan on hazard │
  │ NET    Zenoh pub/sub · Protobuf · zone sharding · gossip · sanity gate   │
  │ BODY   tracking controller → cmd_vel (differential drive)                │
  └──────────────────────────────────────────────────────────────────────────┘

  SIMULATOR (separate process): PHYSICS EMULATOR ONLY.
  Integrates robot motion, detects collisions, feeds each robot its OWN noisy pose.
  Robots NEVER read other robots' state from the simulator — only from the mesh.
```

### 2.1 Precedence (print this on a slide)

```
L0 SAFETY  >  L1 NEGOTIATION  >  L2 TASKS
```

- **L0 always runs and can override anything.** Safety never depends on winning a bid or holding a lease.
- **L1 is an efficiency layer.** If it fails or is silent, robots yield conservatively and L0 keeps everyone safe.
- **L2 is a throughput layer.** If it fails, running tasks continue; unassigned tasks wait.

### 2.2 Design principles

1. **No component has authority over another robot.** Not the observer, not the order injector, not the sim.
2. **Silence is treated as danger, not consent.** Missing information makes a robot more conservative.
3. **Every grant expires.** Leases and task assignments carry TTLs; nothing is held forever.
4. **Deterministic tie-breaks.** Same inputs → same decision on every robot, no extra round-trips.
5. **Graceful degradation.** Each failure mode has a defined, tested fallback (Section 13.7).

---

## 3. Process model & simulation

- **One OS process per robot** (Python for speed of development; keep hot loops NumPy-vectorised). Separate processes prove there is no shared memory "cheating."
- **Simulator** = kinematic physics emulator only. It provides each robot a noisy own-pose (Gaussian, configurable) and detects collisions. It does **not** provide peer positions.
- **Skip real perception.** No LiDAR/EKF development. Feed a noisy pose plus a simple range model for static obstacles if needed. Perception is not what the PS judges.
- **World:** warehouse roadmap graph (nodes = intersections/pick/drop points, edges = aisles) with 4-way crossings, a narrow head-on aisle, and a pick/drop area.
- **Determinism:** every scenario takes a `seed`; the sim, jitter, and task arrivals derive from it. Same seed → same run. Required for paired benchmarking and for reproducibility.
- **Hardware-in-the-loop (stretch, high value):** one robot process runs on a real Raspberry Pi / Jetson, joined to the same Zenoh mesh, driven by the sim over the network.
- **Fallback if no hardware:** run robot processes in Docker with `--cpus=1 --memory=1g` and state this plainly.

---

## 4. Networking specification (L-NET)

### 4.1 Transport
- **Eclipse Zenoh, peer mode.** One middleware only (do not mention DDS alternatives on slides). Discovery via multicast scouting; data via Zenoh's peer links.
- **Liveliness tokens** provide peer presence, used together with StateBeat freshness for silent-peer detection.
- **Serialization:** Protobuf (`swarmedge_contracts.proto`). Target StateBeat ≈ 100–200 bytes **[target]**.

### 4.2 Topics and rates
See the topic map at the top of the `.proto`. Core rates: StateBeat **10 Hz [start]**, TaskStatus 1 Hz + on change, everything else event-driven.

### 4.3 Zone sharding (key scalability idea)
- Divide the warehouse into grid zones (e.g., 10 m × 10 m **[start]**).
- Publish StateBeat to `swarm/zone/{gx}_{gy}/state` for your current zone.
- Subscribe to own zone + 8 neighbours; re-subscribe on zone change.
- **Effect:** per-robot receive bandwidth scales with *local density*, not fleet size. This is the basis of the scaling curve (S3), compared against a naive "everyone subscribes to everything" mode.

### 4.4 Clock and timing
- Intent uses `t_delta` relative to `header.sent_at`. Receivers also record their own receive time.
- Reject state messages whose `|sent_at − recv_time|` exceeds `MAX_CLOCK_SKEW_S` (2 s **[start]**) rather than trusting them.
- Single-host sim shares a clock. On real hardware, sync with chrony/NTP; document the assumption in Known Limitations.

### 4.5 Sanity gate (Byzantine / outlier rejection)
Reject and log (do not act on) a StateBeat if:
- implied speed from the previous beat exceeds `v_max × 1.5` (teleport),
- `seq` is not increasing,
- pose is outside the map, or
- a `bid_total` exceeds the configured maximum for its inputs (bid clamp; prevents bid inflation).

Repeated offenders are added to a local **distrust list** (treated as a static hazard with inflation, never as an authority).

---

## 5. L0 — Safety Kernel

The Safety Kernel is the only layer the zero-collision claim rests on. Keep it small and testable.

### 5.1 ORCA (Optimal Reciprocal Collision Avoidance)
- Each robot computes ORCA half-planes for neighbours from `StateBeat` (position, velocity, radius) and solves the LP for the closest safe velocity to its preferred velocity.
- **Differential-drive note:** ORCA outputs a holonomic velocity. Track it with a controller and **inflate each radius by a tracking-error bound** (`radius_effective = radius_m + e_track`). State this assumption openly; it is a known limitation.
- Heterogeneous fleet: each robot has its own `radius_m`, `mass_kg`, `max_decel_mps2`. Use discs (not oriented boxes).

### 5.2 Stopping envelope
```
a_max      = F_brake / (mass_kg + payload_kg)          # payload-aware
d_stop     = v² / (2 · a_max) + v · t_react            # t_react [start] 0.15 s
```
Cap commanded speed so `d_stop` fits inside the clear distance to the nearest obstacle or peer intent. A laden robot therefore brakes earlier and yields sooner, which is the physical grounding for kinetic-energy-aware priority in L1.

### 5.3 Silent-peer reachable-set inflation (the Wi-Fi-drop answer)
If a peer's last StateBeat is older than `T_STALE` (0.5 s **[start]**):
```
r_inflated(t) = r_peer + pos_uncertainty + v_max_peer · (t − t_last)
```
Treat the peer as an obstacle of radius `r_inflated(t)`, **restricted to the roadmap edges it could reach** where the graph is known (this keeps inflation tight in aisles). Inflation is capped and released as soon as a fresh beat arrives.

Escalation:
| Silence duration | Action |
|---|---|
| < `T_STALE` | Normal operation using dead-reckoned intent |
| ≥ `T_STALE` | Inflate reachable set; reduce own max speed near that peer |
| ≥ `T_LOST` (5 s **[start]**) | Declare peer *presumed faulted*: create local BLOCKED hazard around last known position, trigger task re-auction (Section 9), gossip hazard |
| Peer returns | Clear inflation, drop hazard (higher `version` wins in gossip) |

### 5.4 Global comms-loss behaviour
If a robot hears **no** peers for `T_ISOLATED` (3 s **[start]**): reduce max speed, prefer wide aisles, avoid intersections with unknown occupancy (stop before the node boundary), keep ORCA active against anything its own sensors see.

### 5.5 Safety metrics (logged always)
- `min_separation_m` per pair and global minimum
- `collision_count` (from the simulator — ground truth)
- `near_miss_count` (separation < `r_i + r_j + margin`, margin **[start]** 0.3 m)

---

## 6. L1 — Lease-based negotiation

### 6.1 Protocol
Per intersection node `N`:

1. **Request:** a robot within `D_APPROACH` of the node boundary broadcasts `LeaseRequest` (repeated at 2 Hz while waiting).
2. **Rank:** every robot independently ranks the requests it has seen for `N`: `bid.total` DESC, then `robot_id` ASC. Same inputs → same ranking.
3. **Claim:** the head-of-queue robot broadcasts `LeaseClaim` with `valid_until = now + TTL` (TTL = estimated crossing + 1 s **[start]**).
4. **Yield:** all others stop before the node boundary until they see `LeaseRelease` or claim expiry.
5. **Release:** holder broadcasts `LeaseRelease` on exit. Expiry auto-releases.
6. **Conflicting claims** (two robots claim in the same instant): the claim with the higher `(bid_total, −robot_id)` wins; the loser yields immediately.

**Key rule: no valid claim heard → yield.** ORCA remains active throughout, so a double-win still cannot cause a collision.

### 6.2 Bid function
```
bid = w_u · urgency  +  w_e · KE_norm  +  w_a · wait_age_s
KE  = 0.5 · (mass_kg + payload_kg) · v²          # normalised by fleet max
```
Starting weights **[start]**: `w_u = 1.0`, `w_e = 0.6`, `w_a = 0.5` per second waited.

**Starvation-freedom argument:** `urgency` and `KE_norm` are bounded; `wait_age_s` grows without bound. A robot that keeps waiting therefore eventually out-bids any newly arrived robot (whose age is ~0). Waiting time is bounded by `(max_bounded_terms) / w_a` plus occupancy of current holders. Verify empirically with the aging ablation.

### 6.3 N-way convergence (replaces "Virtual Traffic Light")
The ranked queue **is** the traffic light: for 3+ robots converging, the queue serialises crossings in bid order, with an optional compatibility optimisation (non-conflicting movements through the same node, e.g., opposite straight-throughs, may hold concurrent leases).

### 6.4 State machine (per robot, per node)
```
IDLE → REQUESTING → (head?) → CLAIMING → CROSSING → RELEASED
          │ not head            │ conflict lost
          └──── YIELDING ◄──────┘
   any state ── lease expiry / timeout ──► REQUESTING (re-rank)
```

---

## 7. Deadlock and livelock escape ladder

Applied in order; each rung only fires if the previous fails.

| Rung | Trigger | Action |
|---|---|---|
| 1. Micro-jitter | Two robots oscillating (velocity sign flips ≥ N in T) | Deterministic pseudo-random phase offset in replanning, seeded from `hash(robot_id, seed)` — breaks symmetry without extra messages |
| 2. Priority override | Same pair blocked > 2 s **[start]** | Aging term dominates; force ranking outcome |
| 3. Back-off | Blocked > 5 s **[start]** | Lower-ranked robot reverses to nearest roadmap **spur/passing bay**, broadcasts `YIELDING/BACKING_OFF` |
| 4. Re-plan | Still blocked > 10 s **[start]** | Mark edge congested, gossip a SLOW_ZONE, re-plan alternate route or re-auction task |

Log every rung firing; the ablation "jitter off" should visibly produce livelocks.

---

## 8. Planning

- **Global:** A\* over the roadmap graph (dozens–hundreds of nodes; cheap on a Pi). Edge cost = length / speed limit + congestion penalty + hazard penalty.
- **Time-window reservations ("lite"):** robots publish their planned node-arrival windows inside the intent; planner avoids nodes/edges already claimed in overlapping windows. Call this **time-window reservations on a topological graph**, not D-SIPP — be accurate.
- **Local:** velocity tracking of the ORCA-adjusted preferred velocity (a full DWA is optional; only add if time allows).
- **Re-plan triggers:** new BLOCKED_EDGE hazard, lost peer, lease timeout, deadlock rung 4.

---

## 9. L2 — Task allocation (Contract Net Protocol + leases)

### 9.1 Flow
1. `TaskAnnounce` published by the **order injector** (a peer with no authority).
2. Robots submit `TaskBid` within `bid_window_s` (1 s **[start]**).
3. Bid cost:
   ```
   cost = α·distance_m + β·(1 − battery_pct/100) + γ·queue_len
   ```
   **[start]** α = 1.0, β = 20, γ = 5. Ineligible robots (battery < 20%, FAULTED, payload capacity) do not bid.
4. Lowest cost wins; ties → lowest `robot_id`. The winner self-publishes `TaskAward` (`attempt = 0`); others verify against the bids they saw.

### 9.2 Task leases (closes the "failed robot" gap)
- The winner renews the task lease by publishing `TaskStatus` (1 Hz). Lease TTL = 3 s **[start]**.
- If renewal stops (robot killed, stalled, partitioned) or the robot publishes `ABORTED`/SOS, **any** robot that observes the expiry re-announces the task with `attempt + 1`.
- **Duplicate-execution guard:** a higher `attempt` supersedes; a robot that returns from a partition and sees a higher attempt for its task drops it.
- Blocked aisle: a robot that cannot reach pickup/dropoff after re-plan releases the task (`ABORTED`) → re-auction.

### 9.3 Metric
`reauction_latency_s` = time from fault to a new `TaskAward`. Report it.

---

## 10. Hazard gossip and SOS

- `HazardReport` (blocked edge, slow zone, SOS geofence) carries `hazard_id`, `version`, `expires_at`.
- **Push:** on discovery, broadcast to nearby zones. **Anti-entropy:** every 1 s send a `HazardDigest` to 2 random peers; peers pull missing/older items. Higher `version` wins; `hop_count` damps flooding.
- `SosBroadcast` from a faulted robot is repeated 3× and converts to a SOS_GEOFENCE hazard; fleet routes around it and re-auctions its tasks.
- Hazards expire (`expires_at`) unless renewed, so stale blockages heal.

---

## 11. Observer ("Ghost Node") and dashboard

- Subscribe-only Zenoh peer on `swarm/**`. **It has no publisher.** The UI shows a live **"packets published by observer: 0"** counter.
- Views: live map with positions/heading/intent; per-robot battery/state/payload; active leases; hazards; task board.
- **Heatmap (P4):** aggregate speed-below-nominal per grid cell to expose choke points.
- **SLO strip (always visible):** collisions, min separation, active robots, packet rate, worst CPU.
- Lightweight stack suggestion: Python backend (Zenoh subscriber → WebSocket) + a single-page frontend (Canvas/SVG). Keep it simple; the PS asks for a lightweight UI.

---

## 12. Chaos Console (S1) and Server-Kill Duel (S2)

### 12.1 Chaos Console
A judge-operable panel publishing `ChaosCommand` on `sim/chaos` (consumed by the sim and a network-emulation helper only; robots never subscribe):
- Kill robot · Stall robot · Partition network · Packet loss · Latency spike · Block aisle · Add robots · Byzantine telemetry.
- Network faults implemented with Linux `tc netem` / `iptables` on the containers (or an in-process drop shim in the sim).

### 12.2 Server-Kill Duel
Split screen, same scenario, same seed:
- **Left:** centralized planner (single coordinator process assigns paths/leases) — also your **oracle baseline**.
- **Right:** SwarmEdge.
- Press **"Kill coordinator"** (`KILL_COORDINATOR`). Left fleet freezes or degrades to a stop-and-wait fallback; right continues unaffected.

This is the opening 10 seconds of the video.

---

## 13. Benchmark and proof plan

### 13.1 Systems compared
| ID | System | Purpose |
|---|---|---|
| B0 | **Stop-and-wait** (PS baseline): robots stop at intersections, one at a time, first-come, no intent sharing | The PS's 20% claim |
| B1 | **Centralized prioritized planner** | Oracle / upper bound; used in the Duel |
| SE | **SwarmEdge** | System under test |

Baseline fairness rules: identical map, task list, robot params, and seeds; B0 uses sensible speeds (no artificial slowdowns); document B0 precisely so a judge cannot call it a strawman.

### 13.2 Scenarios
| ID | Scenario | Stress |
|---|---|---|
| S-A | 4-way crossing, 3 / 4 robots converging | Right-of-way, N-way queue |
| S-B | Narrow aisle, head-on pair | Deadlock ladder |
| S-C | Pick-and-drop workload, 3 / 6 / 12 robots, overlapping paths | Makespan, throughput (**the PS 20% scenario**) |
| S-D | Aisle blocked mid-run | Hazard gossip, re-plan |
| S-E | Robot killed mid-task | Task lease, re-auction |
| S-F | Fault sweep: 5 s blackout, 30% packet loss, latency spikes, Byzantine robot | Safety kernel, sanity gate |

### 13.3 Metrics
Safety: `collision_count`, `near_miss_count`, `min_separation_m`.
Efficiency: makespan, mean/p95 task completion time, throughput (tasks/hour), total wait time.
Resilience: deadlock count/duration, `reauction_latency_s`, time-to-recover after fault, task completion rate under fault.
Edge: CPU %, RSS memory, bandwidth (kbps) per robot, per-loop latency.

### 13.4 Statistics
- **≥ 30 seeds per scenario per system**; same seed across systems (paired).
- Report **median, p95, and bootstrap 95% CI** of the paired % reduction; use a Wilcoxon signed-rank test for significance.
- Do **not** cherry-pick seeds. Publish all runs in the report.
- Target internal cushion **[target]**: ≥ 25–30% median makespan reduction vs B0 in S-C so noise cannot drop it below 20%. If measured gain is lower, report the measured number honestly.

### 13.5 Scaling study (S3)
3, 5, 10, 20, 30 robots. Plot per-robot bandwidth and CPU vs N for **zone-sharded** vs **full broadcast**. Also plot makespan vs N for SE vs B0/B1. Report the largest N where zero-collision and target CPU still hold.

### 13.6 Ablations (shows you understand your own system)
Turn off one at a time, report the effect:
| Ablation | Expected failure |
|---|---|
| Jitter off | Livelock/hallway dance rate rises |
| Aging term off | Starvation of low-bid robots |
| Silent-peer inflation off | Near-misses/collisions under blackout |
| Lease TTL off | Stuck leases after robot death |
| Sanity gate off | Byzantine robot corrupts swarm |
| Zone sharding off | Bandwidth grows with N |

### 13.7 Proof Matrix (one slide)
| Failure mode | Expected behaviour | Test / evidence |
|---|---|---|
| Coordinator killed | Right-side fleet unaffected | Server-Kill Duel |
| 5 s Wi-Fi blackout | Slow + inflate + stay collision-free | S-F, `collision_count = 0` |
| 30% packet loss | Throughput degrades gracefully, no collisions | S-F |
| Robot killed | Peers inflate, task re-auctioned, aisle rerouted | S-E, `reauction_latency_s` |
| Duplicate/conflicting lease claim | Deterministic winner; ORCA backstop | Injected duplicate-claim test |
| Byzantine telemetry | Rejected + distrust list | S-F, sanity-gate log |
| Blocked aisle | Gossip → re-plan | S-D |
| Deadlock | Ladder rungs resolve | S-B, ladder log |

### 13.8 Headline slide template (fill **only** with measured values)
```
0 collisions / ___ fault-injected episodes
−___% median makespan vs stop-and-wait  (95% CI ___–___)
within ___% of centralized oracle
___% of one Pi-class core · ___ MB RAM
30 robots · < ___ kbps per robot (zone-sharded)
```
Word safety as: *"0 collisions across N fault-injected episodes, supported by a reachability-based safety argument."* Do **not** say "formally proven."

### 13.9 One-command reproducibility (S4)
`make demo` runs the seeded suite and auto-generates `report.md` with tables and plots (min separation, collisions, makespan, CPU/bandwidth). Judges who can rerun trust more.

---

## 14. Edge resource profiling (P3)

- Per-process sampler: CPU %, RSS, Zenoh bandwidth in/out, control-loop period jitter.
- Run under Pi-class limits (Docker `--cpus=1 --memory=1g`), and on a real Pi/Jetson if available.
- Report at 3 / 12 / 30 robots. **[target]** < 40% of one core and < 300 MB per robot at 12 robots — validate, then state the measured figure.
- Loop budget **[start]**: control 20 Hz, state publish 10 Hz, negotiation event-driven, planner on demand.

---

## 15. Repository structure and commands

```
swarmedge/
├── proto/swarmedge_contracts.proto
├── robot/            # robot process: net, safety, negotiation, tasks, planner, body
├── sim/              # physics emulator, scenarios, collision oracle, chaos hooks
├── baselines/        # stop_and_wait/, centralized/
├── observer/         # ghost node backend + dashboard frontend
├── bench/            # scenario runner, seeds, stats, report generator
├── docker/           # per-robot images with cpu/mem limits, netem helpers
├── docs/             # PRD, proof matrix, limitations
└── Makefile          # make demo | make bench | make chaos | make profile
```

---

## 16. Feature scope

### Core (must ship)
| ID | Feature | Original IDs |
|---|---|---|
| C1 | Zenoh mesh, Protobuf, zone-sharded topics, intent broadcast | 01, 02 |
| C2 | Safety Kernel: ORCA + stopping envelope + silent-peer inflation | 08, 04, part of 07 |
| C3 | Lease-based negotiation with N-way queue, aging, deterministic tie-break | 06, 07, 09 |
| C4 | Deadlock escape ladder | 10, 21 |
| C5 | Roadmap planner + time-window reservations (lite) | 12 |
| C6 | CNP with task leases and fault re-auction | 13 |
| C7 | Hazard gossip + SOS geofence | 03, 15 |
| C8 | Sanity gate (kinematic jump, bid clamp) | 05 |

### Proof and demo (must ship)
| ID | Feature | Original IDs |
|---|---|---|
| P1 | Ghost-node observer with "published: 0" counter | 17 |
| P2 | Benchmark harness (3 systems, seeds, ablations) | 18 |
| P3 | Edge profiler | 20 |
| P4 | Congestion heatmap (cheap, high visual value) | 19 |

### Signature (differentiators)
| ID | Feature |
|---|---|
| S1 | Chaos Console (judge-operable fault injection) |
| S2 | Server-Kill Duel (split screen vs centralized) |
| S3 | Scaling curve 3 → 30 robots (zone-sharded vs broadcast) |
| S4 | One-command reproducible report (`make demo`) |

### Cut → roadmap slide only
Dynamic corridor platooning (11), dynamic aisle direction flipping (14, risks transition deadlocks), health/SoC-constrained routing (16), oriented-bounding-box heterogeneity (22 → replaced by per-robot radius/mass/braking parameters). Virtual Traffic Lights (09) are subsumed by the N-way lease queue.

---

## 17. 20-day execution plan with kill-gates

| Days | Work | Gate |
|---|---|---|
| D1–3 | Physics-only sim, per-robot processes, Zenoh mesh, Protobuf codegen, stop-and-wait baseline B0, logging + collision oracle | Gate 0: 3 robots exchange StateBeats; B0 runs end-to-end |
| D4–7 | Safety Kernel (ORCA, envelope, silent-peer), intent broadcast, lease negotiation | **Gate 1:** 3 robots cross a 4-way intersection, **0 collisions over 100 seeds** |
| D8–11 | Roadmap planner + reservations, deadlock ladder, CNP + task leases + re-auction, hazard gossip | **Gate 2:** full warehouse scenario S-C runs end-to-end |
| D12–14 | Benchmark harness, centralized baseline B1, ablations, stats | **Gate 3:** real numbers. If median gain < 25%, tune now |
| D15–16 | Ghost observer, heatmap, Chaos Console, Server-Kill Duel | Gate 4: all demo controls work live |
| D17–18 | Profiling on Pi/containers, scaling curve, fault sweeps | **Feature freeze at end of D18** |
| D19–20 | Video, PPT, README, three full rehearsals, backup recording | Gate 5: demo passes 3 consecutive runs |

**If Gate 2 slips past D12:** cut S3 first, then P4. **Never cut** S2, P2, or C2.

### Team tracks (split by track, not by feature)
1. **Sim + mesh:** simulator, Zenoh layer, contracts, sanity gate.
2. **Safety + negotiation:** Safety Kernel, leases, deadlock ladder.
3. **Tasks + planning:** roadmap, reservations, CNP, hazard gossip.
4. **Proof:** benchmark, baselines, observer/dashboard, Chaos Console, profiling.

With fewer people: one person owns two adjacent tracks; drop S3 and P4 first.

---

## 18. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Scope overrun | High | Kill-gates; cut order defined; feature freeze D18 |
| Centralized baseline B1 adds work | Medium | Keep it minimal (single process, prioritized A\* + lease table); it doubles as the Duel |
| Gain vs B0 < 20% | Medium | Tune early (Gate 3); ensure S-C has truly overlapping paths as the PS specifies; report honestly |
| Multicast/Zenoh discovery issues in Docker/Wi-Fi | Medium | Configure explicit peer endpoints as fallback; test on D1 |
| ORCA + diff-drive tracking error | Medium | Radius inflation by tracking-error bound; validate min separation |
| Live demo failure | Medium | Deterministic seeds, pre-recorded backup, three rehearsals |
| No Pi available | Medium | Docker CPU/RAM limits; state it plainly |
| Python performance at 30 robots | Medium | Vectorise ORCA neighbour loops; limit neighbours to K nearest; profile early |

---

## 19. Known limitations (put on a slide — it earns credibility)

- **Sim-to-real gap:** results are simulated; real wheel slip, LiDAR noise, and Wi-Fi behaviour will differ.
- **ORCA assumes disc-shaped agents;** differential-drive tracking is handled by radius inflation, not a diff-drive-specific ORCA.
- **Statistical, not formal, safety:** evidence is seeded fault-injected episodes plus a reachability argument, not a formal proof.
- **Clock synchronisation** is assumed to be within `MAX_CLOCK_SKEW_S`.
- **Unauthenticated messages:** a malicious insider could spoof peers; the sanity gate limits, but does not eliminate, this. Message signing is roadmap.
- **Roadmap-graph world:** free-space navigation and dense grid environments are out of scope.
- **Parameter values** are tuned per scenario set; portability to other layouts needs re-tuning.

---

## 20. Definition of Done (checklist)

- [ ] All robot processes run with **no shared memory** and no central process required for operation
- [ ] Observer shows `published: 0` for the entire demo
- [ ] `collision_count = 0` across **all** benchmark and fault-sweep episodes
- [ ] ≥ 20% median makespan reduction vs B0 in S-C with CI, at 3, 6, and 12 robots
- [ ] Task re-auction demonstrated on robot kill and blocked aisle, with latency reported
- [ ] Server-Kill Duel runs live and in the backup video
- [ ] Scaling curve and profiler report generated by `make demo`
- [ ] Known-limitations and roadmap slides included
- [ ] Three consecutive clean demo rehearsals
