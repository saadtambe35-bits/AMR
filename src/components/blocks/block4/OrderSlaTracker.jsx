import { useEffect, useState } from "react";
import { useT } from "./i18n";
import { STATIONS, SLA_DEFAULT, PRIO_COLOR, useStore, statusOf, injectOrder, selectOrder, setInject } from "./orderStore";

const CSS = `
.ost{font-family:"Noto Sans Devanagari","Nirmala UI",Inter,system-ui,sans-serif;line-height:1.55;color:#e2e8f0;background:#070b12;border:1px solid #172640;border-radius:10px;padding:12px}
.ost *{box-sizing:border-box;min-width:0}
.ost-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-bottom:10px}
.ost-kpi{background:#0b1322;border:1px solid #172640;border-left:3px solid #0ea5e9;border-radius:8px;padding:6px 10px}
.ost-kpi b{display:block;font-size:22px;font-variant-numeric:tabular-nums;line-height:1.2}.ost-kpi span{font-size:12px;color:#7d8ba1}
.ost-kpi.g{border-left-color:#10b981}.ost-kpi.r{border-left-color:#ef4444;background:#ef444414}.ost-kpi.r b{color:#ef4444}
.ost-head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.ost-head h3{margin:0;font-size:15px}
.ost-btn{background:#0ea5e9;color:#04121c;border:0;border-radius:6px;font:inherit;font-size:13px;font-weight:600;padding:4px 12px;cursor:pointer}
.ost-btn.ghost{background:none;color:#7d8ba1;border:1px solid #172640}
.ost-btn:focus-visible,.ost tr:focus-visible{outline:2px solid #0ea5e9;outline-offset:2px}
.ost-wrap{overflow-x:auto}.ost table{width:100%;border-collapse:collapse;font-size:13px}
.ost th{text-align:left;color:#7d8ba1;font-weight:500;padding:4px 8px;border-bottom:1px solid #172640;white-space:nowrap}
.ost td{padding:4px 8px;border-bottom:1px solid #0f1a2e;white-space:nowrap;font-variant-numeric:tabular-nums}
.ost tbody tr{cursor:pointer}.ost tbody tr:hover{background:#0b1322}.ost tr.sel{background:#0ea5e91c;box-shadow:inset 3px 0 #0ea5e9}
.ost-b{display:inline-block;padding:0 8px;border-radius:4px;font-size:11.5px;font-weight:700}
.ost-blink{animation:ost-bl 1s steps(2) infinite}@keyframes ost-bl{50%{opacity:.35}}
@media (prefers-reduced-motion:reduce){.ost-blink{animation:none}}
.ost-modal{position:fixed;inset:0;background:#000a;display:grid;place-items:center;z-index:50;padding:12px}
.ost-form{background:#0b1322;border:1px solid #0ea5e9;border-radius:10px;padding:16px;width:min(420px,100%);display:grid;gap:10px}
.ost-form label{display:grid;gap:2px;font-size:12.5px;color:#7d8ba1}
.ost-form input,.ost-form select{background:#070b12;color:#e2e8f0;border:1px solid #172640;border-radius:6px;padding:6px 8px;font:inherit}
.ost-form input:focus,.ost-form select:focus{outline:2px solid #0ea5e9}
.ost-2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
`;
if (typeof document !== "undefined" && !document.getElementById("ost-css")) {
  const s = document.createElement("style"); s.id = "ost-css"; s.textContent = CSS; document.head.appendChild(s);
}

const STATUS = { QUEUED: ["#1e2b44", "#e2e8f0"], PICKING: ["#10b981", "#04140e"], TRANSIT: ["#0ea5e9", "#04121c"], DELIVERED: ["#0b1322", "#10b981"], DELAYED: ["#ef4444", "#fff"] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

function Ring({ o, now }) {
  const done = o.phase === "DELIVERED", rem = o.deadline - now, late = !done && rem < 0, f = done ? 1 : clamp(rem / (o.sla * 1000), 0, 1);
  const c = done ? (o.delivered <= o.deadline ? "#10b981" : "#ef4444") : late || f < 0.15 ? "#ef4444" : f < 0.4 ? "#f59e0b" : "#10b981", L = 2 * Math.PI * 14;
  return (
    <svg width="38" height="38" viewBox="0 0 38 38" role="img" aria-label={done ? "delivered" : `${Math.ceil(rem / 1000)}s`}>
      <circle cx="19" cy="19" r="14" fill="none" stroke="#172640" strokeWidth="4" />
      <circle cx="19" cy="19" r="14" fill="none" stroke={c} strokeWidth="4" strokeLinecap="round" strokeDasharray={L} strokeDashoffset={L * (1 - f)}
        transform="rotate(-90 19 19)" className={late ? "ost-blink" : ""} />
      <text x="19" y="22.5" textAnchor="middle" fontSize="9.5" fontWeight="700" fill={c}>{done ? "✓" : late ? "+" + Math.ceil(-rem / 1000) : Math.ceil(rem / 1000)}</text>
    </svg>
  );
}

function InjectModal() {
  const [f, setF] = useState({ sku: "SKU-9001 ×5", prio: "Normal", pick: "P1", drop: "D1", sla: 90 });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, ...(k === "prio" ? { sla: SLA_DEFAULT[e.target.value] } : {}) }));
  useEffect(() => { const k = (e) => e.key === "Escape" && setInject(false); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, []);
  const submit = () => { injectOrder({ ...f, sla: Math.max(10, +f.sla || 90) }); setInject(false); };
  return (
    <div className="ost-modal" onClick={() => setInject(false)}>
      <div className="ost-form" role="dialog" aria-modal="true" aria-label="Inject custom order" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ margin: 0 }}>Inject custom order</h3>
        <label>SKU payload<input autoFocus value={f.sku} onChange={set("sku")} /></label>
        <div className="ost-2">
          <label>Priority<select value={f.prio} onChange={set("prio")}>{Object.keys(SLA_DEFAULT).map((p) => <option key={p}>{p}</option>)}</select></label>
          <label>SLA deadline (s)<input type="number" min="10" value={f.sla} onChange={set("sla")} /></label>
          <label>Source (pick) station<select value={f.pick} onChange={set("pick")}>{STATIONS.filter((s) => s.kind === "pick").map((s) => <option key={s.id}>{s.id}</option>)}</select></label>
          <label>Drop station<select value={f.drop} onChange={set("drop")}>{STATIONS.filter((s) => s.kind === "drop").map((s) => <option key={s.id}>{s.id}</option>)}</select></label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="ost-btn ghost" onClick={() => setInject(false)}>Cancel</button>
          <button className="ost-btn" onClick={submit}>Inject order</button>
        </div>
      </div>
    </div>
  );
}

export function OrderSlaTracker() {
  const t = useT(), { orders, now, selected, kpi, inject } = useStore();
  const rows = [...orders.filter((o) => o.phase !== "DELIVERED"), ...orders.filter((o) => o.phase === "DELIVERED")].slice(0, 14);
  const warn = kpi.late + kpi.risk;
  return (
    <section className="ost" aria-label={t("orderStatus")}>
      <div className="ost-kpis">
        <div className="ost-kpi g"><b>{kpi.ontime}%</b><span>On-time delivery</span></div>
        <div className="ost-kpi"><b>{kpi.cycle.toFixed(1)} s</b><span>Avg order cycle</span></div>
        <div className={`ost-kpi ${warn ? "r" : "g"}`}><b className={kpi.late ? "ost-blink" : ""}>{warn}</b><span>{kpi.late} breached · {kpi.risk} at risk (&lt;10 s)</span></div>
        <div className="ost-kpi"><b>{kpi.active}</b><span>Active orders</span></div>
      </div>
      <div className="ost-head"><h3>{t("orderStatus")}</h3><button className="ost-btn" onClick={() => setInject(true)}>Inject custom order</button></div>
      <div className="ost-wrap">
        <table>
          <thead><tr><th>Order</th><th>Priority</th><th>Pick</th><th>Drop</th><th>Robot</th><th>Status</th><th>SLA</th></tr></thead>
          <tbody>
            {rows.map((o) => {
              const s = statusOf(o, now), [bg, fg] = STATUS[s];
              return (
                <tr key={o.id} className={o.id === selected ? "sel" : ""} tabIndex={0} onClick={() => selectOrder(o.id)} onKeyDown={(e) => e.key === "Enter" && selectOrder(o.id)}>
                  <td><b>{o.id}</b> <span style={{ color: "#7d8ba1" }}>{o.sku}</span></td>
                  <td><span className="ost-b" style={{ background: PRIO_COLOR[o.prio] + "26", color: PRIO_COLOR[o.prio], border: `1px solid ${PRIO_COLOR[o.prio]}` }}>{o.prio}</span></td>
                  <td>{o.pick}</td><td>{o.drop}</td><td>{o.robot || "—"}</td>
                  <td><span className={`ost-b ${s === "DELAYED" ? "ost-blink" : ""}`} style={{ background: bg, color: fg, border: `1px solid ${fg}` }}>{s}</span></td>
                  <td><Ring o={o} now={now} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {inject && <InjectModal />}
    </section>
  );
}
export default OrderSlaTracker;
