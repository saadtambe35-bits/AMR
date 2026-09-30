# SwarmEdge V2: 5-Minute High-Impact Demo Video Script
**Target Duration:** Exactly 5 Minutes (00:00 – 05:00)  
**Pacing:** Brisk, confident, dense with technical authority, zero fluff.  
**Setup:** Open `http://localhost:4173/`, full screen (`F11`).

---

## 5-Minute Timing Roadmap

```mermaid
gantt
    title SwarmEdge V2 — 5-Minute Compact Demo (300 Seconds)
    dateFormat ss
    axisFormat %S s
    section Top Bar & Twin
    01. Pitch & Top Bar Telemetry  :00, 35
    02. Tab 1: 3D/2D Digital Twin  :35, 70
    section P2P Mesh & ESG
    03. Tab 2: Mesh & Partition    :70, 105
    04. Tab 3: Timeline & ESG      :105, 135
    section AI & WMS Operations
    05. Tab 4: What-If & Natural CLI:135, 170
    06. Tab 5: WMS & Order Injection:170, 205
    section Resilience & Duel
    07. Tab 6: Cockpit & L1 Leases :205, 235
    08. Tab 7: Server-Kill Duel    :235, 270
    section Chaos & Proofs
    09. Tabs 8-11: Chaos, Tests & Close:270, 300
```

---

## 00:00 – 00:35 | Introduction, Top Bar & PWA Offline-First

### [SCREEN ACTION]
1. Start on **Warehouse** view.
2. In the top bar, click **GHOST-NODE · PUBLISHED**: show toast.
3. Click **ONLINE**: show it turns to **OFFLINE (SIM)**, then click back to **ONLINE**.
4. Click **ZENOH 0.11.0**: toggle to **ROUTERLESS**, then back.
5. Click **HI** on regional toggle to show Hindi strings, then back to **EN**.

### [SPEECH / NARRATION]
> "Hello judges. Welcome to **SwarmEdge** — the decentralized, brokerless fleet operating system for Autonomous Mobile Robots. 
> 
> Centralized warehouse orchestrators represent a single point of failure: when the central server crashes, the entire facility halts. SwarmEdge eliminates central brokers entirely by executing spatial reservations, contract-net bidding, and SIL-4 safety directly on robot edge processors.
>
> On our top cockpit: our **Ghost-Node Publisher** broadcasts ad-hoc observer heartbeats peer-to-peer. Our client is an **Offline-First PWA** — clicking here simulates an instant industrial Wi-Fi drop where operations continue seamlessly from cache. Our **Zenoh 0.11 mesh** supports dynamic brokerless routing, and our **Regional Switcher** provides instant Hindi and Marathi floor localization."

---

## 00:35 – 01:10 | Tab 1: 3D/2D Live Warehouse Twin

### [SCREEN ACTION]
1. Orbit the 3D canvas slightly to show moving AMRs with headlights, payload racks, and charging docks.
2. Click the top-right **Route Ribbons**, **Labels**, and **Reset Camera** icons.
3. Click **MODE: 3D TWIN / 2D MAP** toggle: show the high-precision 2D tactical radar.
4. Click **2x** speed, then click **HEATMAP** to reveal junction congestion density.

### [SPEECH / NARRATION]
> "In Tab 1, our **Live Digital Twin Studio** runs in hardware-accelerated WebGL at 60 frames per second. It tracks all AMRs in millimeter precision with active chassis dimensions, directional illumination, and dynamic route ribbons.
>
> In one click, we switch from 3D isometric view into a **2D Tactical Radar Map**, displaying heading angles and velocity vectors. Operators can scale simulation speed from 1× to 4× real-time, or activate the **Aisle Congestion Heatmap** to visually spot bottlenecks before they materialize."

---

## 01:10 – 01:45 | Tab 2: Mesh Topology & Partition Proof

### [SCREEN ACTION]
1. Switch to **Mesh Topology** tab (`badge: P2P Proof`).
2. Click node **AMR-01**: show selection ring and the pop-out HUD. Click **⚡ Echo Ping** (`Ping: 3.1ms OK`).
3. Flip the **Simulate Partition** switch ON! Point to **Cluster Alpha** & **Cluster Beta** divided by the severed firewall.
4. Point to the bottom resolution counters incrementing independently, then toggle partition OFF to show automatic reconvergence.

### [SPEECH / NARRATION]
> "Tab 2 proves our **P2P Mesh Architecture**. The force-directed graph maps 6 robot nodes exchanging anti-entropy packets under 4 milliseconds latency.
>
> Clicking **AMR-01** opens its live HUD; clicking **Echo Ping** verifies a 3-millisecond direct peer round-trip.
>
> Now watch our core resilience test: I flip **Simulate Partition**. The warehouse network severs into two isolated sub-swarms — Cluster Alpha and Beta. Look at the arbiter counters: **both sub-swarms elect local leaders and continue arbitrating collision-free intersection leases independently with zero deadlock!** When reconnected, version vectors reconcile instantly."

---

## 01:45 – 02:15 | Tab 3: Timeline & ESG Sustainability Tracker

### [SCREEN ACTION]
1. Switch to **Timeline & ESG** tab (`badge: Gantt+CO2`).
2. Point out **14.2% kWh saved**, **22 kg CO₂ avoided**, and **+18.4% throughput per battery cycle**.
3. Toggle from **Session** to **Annual projection**.
4. Click **Judge pitch export**, click **Copy summary** (shows "Copied"), press `Esc`.

### [SPEECH / NARRATION]
> "In Tab 3, SwarmEdge optimizes **ESG Energy & Carbon Metrics**. Instead of centralized stop-and-wait dispatching — which causes kinetic brake wear and high current spikes — our decentralized velocity tuning yields a **14.2% energy reduction** and **+18.4% throughput per battery cycle**.
>
> Toggling **Annual Projection** scales this to enterprise fleets saving tens of thousands of kilowatt-hours. With our **Judge Pitch Export**, these audited sustainability metrics are copied in a single click."

---

## 02:15 – 02:50 | Tab 4: What-If Hazard Planner & Natural Command

### [SCREEN ACTION]
1. Switch to **What-If & AI** tab (`badge: A* Co-Pilot`).
2. Draw a rectangle over an active aisle: highlight the cyan dashed **Ghost Route** previewing the re-route in real-time.
3. Click **Commit Zone**: show the AMR dynamically re-routing around the obstacle.
4. Click the center **✕** on the hazard zone to delete it.
5. Click **Press / for commands** at bottom, click a prompt (e.g. `/status`), and show the green checkmark reply.

### [SPEECH / NARRATION]
> "In Tab 4, our **What-If Hazard Planner** eliminates static map re-compilation. When an unexpected spill occurs, an operator draws a hazard zone directly on the map.
>
> Notice the **Cyan Ghost Routes** projecting immediate re-route feasibility before committing. Upon clicking **Commit Zone**, the affected AMR recalculates its A* path and maneuvers smoothly around the zone.
>
> Clicking the zone deletes it immediately. Below, our **Natural Command Bar** allows operators to query the fleet via plain English or slash commands."

---

## 02:50 – 03:25 | Tab 5: WMS Twin Studio & Custom Order SLA Feed

### [SCREEN ACTION]
1. Switch to **WMS & Orders** tab (`badge: SLA Feed`).
2. Point out the live table with circular animated SLA countdown rings and priority badges. Click a row to filter.
3. Click **Inject custom order**:
   - Set Priority to `Urgent`, SLA to `60s`.
   - Click **Inject order**: show the order immediately appears in queue and the twin dispatches an AMR above!
4. Point to the left rail: show that speed (`2x`), camera presets, and tracking respond instantly on a single click.

### [SPEECH / NARRATION]
> "Tab 5 combines our **WMS Twin with real-time SLA Tracking**. The live feed monitors on-time fulfillment with dynamic countdown rings.
>
> When I click **Inject Custom Order** with an Urgent 60-second deadline, our decentralized Contract-Net protocol evaluates nearby robot proximities and kinetic energy, awarding and dispatching the task within milliseconds — zero dispatcher latency.
>
> All rail controls — speed multipliers, top-down camera presets, and robot tracking — now respond on instant single-click."

---

## 03:25 – 03:55 | Tab 6: Fleet Cockpit & L1 Intersection Lease Queue

### [SCREEN ACTION]
1. Switch to **Fleet** tab (`badge: 4 online`).
2. Point to top timeline clock running live: click **Pause** (freezes), click **Resume** (ticks forward).
3. Point to **L1 Lease Claims**: show ranked queue based on urgency, kinetic energy ($KE$), and wait age.
4. Click **Inspect** on AMR-01:
   - Click **Isolate Wi-Fi** (turns red), then **Restore Wi-Fi**.
   - Click **Kill Process** (robot enters FAULT), then click **Restore Robot** (cruises again). Close modal.

### [SPEECH / NARRATION]
> "In Tab 6, the **Fleet Cockpit** manages spatial conflict resolution. At intersections, robots evaluate the **L1 Lease Queue**, ranking bids by velocity momentum and wait age to assign exclusive transit without stopping traffic.
>
> The mission clock runs live with Pause and Resume controls. Inspecting **AMR-01** opens its SIL-4 telemetry modal. We can isolate its Wi-Fi or trigger a simulated process failure, watching peers dynamically re-route, before restoring the robot back to service."

---

## 03:55 – 04:30 | Tab 7: Server-Kill Duel (Signature Resilience Demo)

### [SCREEN ACTION]
1. Switch to **Server-Kill** tab (`badge: S2 Duel`). Show Centralized (left) vs SwarmEdge (right).
2. Click **"Lift guard to arm"**: watch the **3D Ballistic Glass Cover** physically flip up!
3. Click the flashing red button: **`☠ KILL CENTRAL COORDINATOR`**!
4. Highlight the stark contrast:
   - Left (Centralized): Sparks fly, server dies, robots freeze dead with `SERVER DEAD` alerts.
   - Right (SwarmEdge): Green `P2P MESH SURVIVED` — AMRs cruise through intersections with **zero stall**!

### [SPEECH / NARRATION]
> "Now, our signature trial: **The Server-Kill Duel**. Synchronized side-by-side: centralized control on the left, SwarmEdge on the right.
>
> I lift the tactical **ballistic glass guard** to arm the kill switch.
>
> **Killing the central coordinator in 3, 2, 1 — KILL!**
>
> Look at the contrast: On the left, the central server dies and the centralized fleet locks up in emergency freeze. But on the right, **SwarmEdge continues flawlessly**. The robots detect coordinator loss, switch to localized peer gossip, and complete every delivery without pausing."

---

## 04:30 – 05:00 | Tabs 8–11: Chaos, Benchmarks, Edge Profiler & Close

### [SCREEN ACTION]
1. Rapidly click **Chaos Console** tab: show the 30% packet loss slider and SIGKILL keys.
2. Click **Tasks & Gossip** tab: show Contract-Net task re-auction on fault and version-vector gossip feed.
3. Click **Benchmarks** tab: click **↺ Resample 30 Seeds** button: show Monte Carlo boxplot re-calculating live above the 20% makespan target.
4. Click **Edge Profiler** tab: click robot **R-02** to reveal edge threads, and click **20R** to show flat 8.9 kbps bandwidth scaling.
5. Click back to **Warehouse** 3D view for final frame.

### [SPEECH / NARRATION]
> "Our resilience is proven across all remaining modules:
> - In **Chaos Console** & **Tasks**, we test 60% packet loss and automated 1.4-second task re-auctioning upon robot failure.
> - In **Benchmarks**, our 30 paired-seed Monte Carlo bootstrap proves a **26.7% makespan reduction**, consistently clearing the 20% target as I resample live.
> - In **Edge Profiler**, resource envelopes verify lightweight operation under **35% single-core CPU**, with bandwidth flat at **8.9 kbps** from 3 to 30 robots.
>
> SwarmEdge proves the future of industrial logistics is brokerless, resilient, and green. Thank you!"

---

## Presenter 5-Minute Cue Sheet (Print / Keep On Second Screen)

| Time | Tab / Target | Key Action |
| :---: | :--- | :--- |
| **`00:10`** | Header | Click `GHOST-NODE` (toast) $\rightarrow$ Click `ONLINE` (turns SIM OFFLINE, then back) $\rightarrow$ Toggle `EN/HI` |
| **`00:35`** | `warehouse` | Toggle `3D/2D` mode $\rightarrow$ Click `2x` speed $\rightarrow$ Click `HEATMAP` |
| **`01:10`** | `mesh topology` | Click `AMR-01` $\rightarrow$ Click `⚡ Echo Ping` $\rightarrow$ Toggle `Simulate Partition` ON then OFF |
| **`01:45`** | `timeline & esg` | Toggle `Annual` $\rightarrow$ Click `Judge pitch export` $\rightarrow$ Click `Copy summary` $\rightarrow$ `Esc` |
| **`02:15`** | `what-if & ai` | Draw box $\rightarrow$ Show cyan ghost route $\rightarrow$ Click `Commit` $\rightarrow$ Click `✕` to delete $\rightarrow$ Enter `/status` |
| **`02:50`** | `wms & orders` | Click `Inject custom order` $\rightarrow$ Select `Urgent` $\rightarrow$ Click `Inject order` |
| **`03:25`** | `fleet` | Show ticking clock $\rightarrow$ Click `Pause` then `Resume` $\rightarrow$ Inspect `AMR-01` $\rightarrow$ Test `Kill` / `Restore` |
| **`03:55`** | `server-kill` | Flip **Ballistic Glass** UP $\rightarrow$ Click **KILL CENTRAL COORDINATOR** |
| **`04:30`** | `chaos` & `tasks`| Show packet loss $\rightarrow$ Show task re-auction timer |
| **`04:45`** | `benchmarks` & `edge`| Click `↺ Resample 30 Seeds` $\rightarrow$ Click robot `R-02` $\rightarrow$ Click `20R` $\rightarrow$ Return to `warehouse` |
