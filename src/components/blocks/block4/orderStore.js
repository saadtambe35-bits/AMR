// Single source of truth for orders, stations and robots. Both the 3D twin and 2D canvas read it,
// so an order status change lights the same station in both views on the same frame.
import { useSyncExternalStore } from "react";

export const STATIONS = [-4, 0, 4].flatMap((z, i) => [
  { id: `P${i + 1}`, kind: "pick", x: -8, z }, { id: `D${i + 1}`, kind: "drop", x: 8, z }]);
export const RACKS = [-8, -4, 0, 4, 8].flatMap((x) => [{ x, z: -7 }, { x, z: 7 }]);
export const PRIO_COLOR = { Urgent: "#ef4444", Normal: "#0ea5e9", Bulk: "#f59e0b" };
export const SLA_DEFAULT = { Urgent: 45, Normal: 90, Bulk: 150 };
const RANK = { Urgent: 0, Normal: 1, Bulk: 2 }, SPEED = 3.2, SKUS = ["SKU-4417 ×6", "SKU-1029 ×12", "SKU-7733 ×3", "SKU-5510 ×24"];
const st = (id) => STATIONS.find((s) => s.id === id);
const pickRand = (a) => a[Math.floor(Math.random() * a.length)];

const S = {
  orders: [], seq: 0, selected: null, follow: null, estop: false, inject: false, nextAuto: 0,
  speedMult: 1, selectedStation: null,
  done: { n: 0, onTime: 0, cycle: 0 },
  robots: [-4.5, -1.5, 1.5, 4.5].map((z, i) => ({ id: `R${i + 1}`, x: 0, z, heading: 0, order: null, path: [], pi: 0, carry: false })),
};
const subs = new Set(); let snap, timer, lastEmit = 0;

export function injectOrder({ sku, prio = "Normal", pick = "P1", drop = "D1", sla }) {
  const p = st(pick), d = st(drop), now = Date.now(), s = sla || SLA_DEFAULT[prio];
  S.orders.unshift({ id: `ORD-${8821 + S.seq++}`, sku, prio, pick, drop, sla: s, robot: null, phase: "QUEUED",
    created: now, deadline: now + s * 1000, delivered: null, dwell: 0,
    route: [{ x: p.x, z: p.z }, { x: 0, z: p.z }, { x: 0, z: d.z }, { x: d.x, z: d.z }] });
  emit();
}
export const statusOf = (o, now) => (o.phase === "DELIVERED" ? "DELIVERED" : now > o.deadline ? "DELAYED" : o.phase);
export const isLit = (id) => S.orders.some((o) => ((o.phase === "QUEUED" || o.phase === "PICKING") && o.pick === id) || (o.phase === "TRANSIT" && o.drop === id)) || S.selectedStation === id;
export const getRobots = () => S.robots, getOrders = () => S.orders, getFollow = () => S.follow, getSelected = () => S.selected;
export const getSpeedMult = () => S.speedMult;
export const setSpeedMult = (m) => { S.speedMult = m; emit(); };
export const getSelectedStation = () => S.selectedStation;
export const setSelectedStation = (id) => { S.selectedStation = S.selectedStation === id ? null : id; emit(); };
export const selectOrder = (id) => { S.selected = id; const o = S.orders.find((o) => o.id === id); if (o?.robot) S.follow = o.robot; emit(); };
export const setFollow = (id) => { S.follow = id; emit(); };
export const cycleFollow = () => { const i = S.robots.findIndex((r) => r.id === S.follow); S.follow = i + 1 < S.robots.length ? S.robots[i + 1].id : null; emit(); };
export const toggleEstop = () => { S.estop = !S.estop; emit(); };
export const setInject = (b) => { S.inject = b; emit(); };

function tick(dt) {
  const now = Date.now();
  if (S.estop) return;
  const effectiveDt = dt * (S.speedMult || 1);
  if (now > S.nextAuto) { S.nextAuto = now + (12000 / (S.speedMult || 1)); const pr = pickRand(["Urgent", "Normal", "Normal", "Bulk"]);
    injectOrder({ sku: pickRand(SKUS), prio: pr, pick: pickRand(["P1", "P2", "P3"]), drop: pickRand(["D1", "D2", "D3"]) }); }
  S.orders.filter((o) => o.phase === "QUEUED").sort((a, b) => RANK[a.prio] - RANK[b.prio] || a.created - b.created).forEach((o) => {
    const r = S.robots.find((r) => !r.order); if (!r) return;
    r.order = o.id; o.robot = r.id; o.phase = "PICKING"; o.dwell = 1.5; r.path = [o.route[0]]; r.pi = 0; });
  S.robots.forEach((r) => {
    const o = r.order && S.orders.find((o) => o.id === r.order); if (!o) return;
    const t = r.path[r.pi], dx = t.x - r.x, dz = t.z - r.z, d = Math.hypot(dx, dz), step = SPEED * effectiveDt;
    if (d > 0.02) r.heading = Math.atan2(dz, dx);
    if (d > step) { r.x += (dx / d) * step; r.z += (dz / d) * step; return; }
    r.x = t.x; r.z = t.z;
    if (o.phase === "PICKING") { if ((o.dwell -= effectiveDt) <= 0) { o.phase = "TRANSIT"; r.carry = true; r.path = o.route.slice(1); r.pi = 0; } }
    else if (++r.pi >= r.path.length) {
      o.phase = "DELIVERED"; o.delivered = now; r.order = null; r.carry = false; r.path = [];
      S.done.n++; S.done.cycle += now - o.created; if (now <= o.deadline) S.done.onTime++; }
  });
  const fin = S.orders.filter((o) => o.phase === "DELIVERED");
  if (fin.length > 8) S.orders = S.orders.filter((o) => o.phase !== "DELIVERED" || fin.slice(0, 8).includes(o));
}

function build() {
  const now = Date.now(), act = S.orders.filter((o) => o.phase !== "DELIVERED"), { n, onTime, cycle } = S.done;
  return { orders: S.orders.slice(), robots: S.robots, now, selected: S.selected, follow: S.follow, estop: S.estop, inject: S.inject,
    speedMult: S.speedMult, selectedStation: S.selectedStation,
    kpi: { ontime: n ? Math.round((100 * onTime) / n) : 100, cycle: n ? cycle / n / 1000 : 0, late: act.filter((o) => now > o.deadline).length,
      risk: act.filter((o) => now <= o.deadline && o.deadline - now < 10000).length, active: act.length } };
}
function emit() { lastEmit = Date.now(); snap = build(); subs.forEach((f) => f()); }
function start() {
  ["P1", "P2", "P3"].slice(0, 2).forEach((p, i) => injectOrder({ sku: SKUS[i], prio: i ? "Normal" : "Urgent", pick: p, drop: `D${i + 1}` }));
  timer = setInterval(() => { tick(0.05); if (Date.now() - lastEmit > 250) emit(); }, 50);
}
snap = build();
export const useStore = () => useSyncExternalStore((cb) => { subs.add(cb); if (!timer) start(); return () => subs.delete(cb); }, () => snap, () => snap);
