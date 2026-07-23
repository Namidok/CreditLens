"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API = "";
const ACCENT = "#0E5A4A";
const RED = "#B4232A";
const AMBER = "#9A6700";

const card = "rounded-xl border border-[#E4E4DE] bg-white shadow-sm";
async function jget(path: string) { const r = await fetch(`${API}${path}`); return r.json(); }

const SUGGESTIONS = [
  "What is Atlantic Mezzanine's leverage covenant?",
  "Which fund had a borrower default this quarter?",
  "What is Alpine's tightest covenant?",
];

function portfolioSeries(funds: Record<string, any[]> | undefined) {
  if (!funds) return [];
  const byDate: Record<string, { nav: number; yw: number; lev: number[]; cov: number[] }> = {};
  Object.values(funds).forEach((rows) => rows.forEach((r) => {
    const d = String(r.date);
    byDate[d] ??= { nav: 0, yw: 0, lev: [], cov: [] };
    byDate[d].nav += r.nav_eur_m; byDate[d].yw += r.yield_pct * r.nav_eur_m;
    byDate[d].lev.push(r.leverage); byDate[d].cov.push(r.coverage);
  }));
  return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, nav: v.nav, wy: v.yw / v.nav,
      lev: v.lev.reduce((s, x) => s + x, 0) / v.lev.length,
      cov: v.cov.reduce((s, x) => s + x, 0) / v.cov.length }));
}

function Delta({ d, goodWhenUp, suffix = "" }: any) {
  if (d === null || d === undefined || Math.abs(d) < 0.005)
    return <span className="text-[11px] text-[#9A9A94]">flat quarter-over-quarter</span>;
  const up = d > 0; const good = up === goodWhenUp;
  return (
    <span className="text-[11px] font-semibold" style={{ color: good ? ACCENT : RED }}>
      {up ? "▲" : "▼"} {Math.abs(d).toFixed(1)}{suffix} quarter-over-quarter
    </span>
  );
}

function Kpi({ label, value, suffix = "", delta = null, goodWhenUp = true, dSuffix = "", delay = 0 }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.35 }} className={`${card} p-5`}>
      <div className="text-[11px] uppercase tracking-[0.08em] text-[#6B6B66] font-semibold leading-snug">{label}</div>
      <div className="mt-2 text-[26px] leading-none font-semibold" style={{ fontFeatureSettings: '"tnum"' }}>{value}{suffix}</div>
      <div className="mt-2"><Delta d={delta} goodWhenUp={goodWhenUp} suffix={dSuffix} /></div>
    </motion.div>
  );
}

function Pill({ active, label, onClick }: any) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
        active ? "border-[#0E5A4A] text-[#0E5A4A] bg-[#0E5A4A0d]"
               : "border-[#D8D8D2] text-[#6B6B66] hover:border-[#141414] hover:text-[#141414]"}`}>
      {label}
    </button>
  );
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-12 mb-4">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {sub && <p className="text-[13px] text-[#6B6B66] mt-1 max-w-3xl">{sub}</p>}
    </div>
  );
}

function DashboardInner() {
  const searchParams = useSearchParams();

  const [meta, setMeta] = useState<any>(null);
  const [sel, setSel] = useState<any>({ strategies: [], geographies: [], vintages: [] });
  const [kpis, setKpis] = useState<any>(null);
  const [watch, setWatch] = useState<any[]>([]);
  const [ts, setTs] = useState<any>(null);
  const [funds, setFunds] = useState<any[]>([]);
  const [rejected, setRejected] = useState<any[]>([]);
  const [tab, setTab] = useState<"dash" | "quality" | "ask">("dash");
  const [deep, setDeep] = useState("F003");
  const [demoLoading, setDemoLoading] = useState(false);

  const [receipt, setReceipt] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>({});

  const [q, setQ] = useState("");
  const [chat, setChat] = useState<any[]>([]);
  const [asking, setAsking] = useState(false);

  const qs = useMemo(() =>
    `?strategies=${sel.strategies.join(",")}&geographies=${sel.geographies.join(",")}&vintages=${sel.vintages.join(",")}`, [sel]);

  async function loadMeta() {
    const m = await jget("/api/meta");
    setMeta(m);
    setSel({ strategies: m.strategies, geographies: m.geographies, vintages: m.vintages });
  }

  async function loadDemo() {
    setDemoLoading(true);
    await fetch(`${API}/api/demo`, { method: "POST" });
    await loadMeta();
    setDemoLoading(false);
  }

  useEffect(() => {
    const isDemo = searchParams.get("demo") === "1";
    (async () => { if (isDemo) { await loadDemo(); } else { await loadMeta(); } })();
  }, [searchParams]);

  useEffect(() => {
    if (!meta) return;
    jget(`/api/kpis${qs}`).then(setKpis);
    jget(`/api/watchlist${qs}`).then(setWatch);
    jget(`/api/timeseries${qs}`).then(setTs);
    jget(`/api/funds${qs}`).then(setFunds);
    jget(`/api/rejected`).then(setRejected);
  }, [meta, qs]);

  const series = useMemo(() => portfolioSeries(ts?.funds), [ts]);
  const deltas = useMemo(() => {
    if (series.length < 2) return { nav: null, wy: null, lev: null, cov: null };
    const a = series[series.length - 2], b = series[series.length - 1];
    return { nav: b.nav - a.nav, wy: b.wy - a.wy, lev: b.lev - a.lev, cov: b.cov - a.cov };
  }, [series]);

  async function doUpload(file: File) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
    setReceipt(await res.json()); setCommitResult(null); setOnboarding({});
    setUploading(false);
  }

  async function doCommit() {
    setCommitting(true);
    const res = await fetch(`${API}/api/commit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filename: receipt.filename, rows: receipt.clean_rows,
        fund_meta: Object.keys(onboarding).length ? onboarding : null }),
    });
    const data = await res.json(); setCommitResult(data); setCommitting(false);
    if (data.ok) await loadMeta();
  }

  async function doAsk(text?: string) {
    const question = (text ?? q).trim(); if (!question) return;
    setQ(""); setAsking(true);
    setChat((c) => [...c, { role: "user", text: question }]);
    const res = await fetch(`${API}/api/ask`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    const data = await res.json();
    setChat((c) => [...c, { role: "ai", text: data.answer, sources: data.sources }]);
    setAsking(false);
  }

  function closeReceipt() { setReceipt(null); setCommitResult(null); setOnboarding({}); }
  const toggle = (key: any, v: any) =>
    setSel((s: any) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x: any) => x !== v) : [...s[key], v] }));

  const deepData = ts?.funds?.[deep] ?? ts?.funds?.[Object.keys(ts?.funds ?? {})[0]] ?? [];
  const step = commitResult?.ok ? 3 : commitResult?.needs_onboarding ? 2 : 1;

  return (
    <div>
      <header className="sticky top-0 z-40 backdrop-blur bg-white/85 border-b border-[#E4E4DE]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
          <a href="/" className="font-semibold tracking-tight">CreditLens</a>
          <nav className="flex gap-1 rounded-lg border border-[#E4E4DE] bg-[#F6F6F2] p-1">
            {[["dash", "Portfolio"], ["quality", "Review Queue"], ["ask", "Ask the Documents"]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k as any)}
                className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition ${
                  tab === k ? "bg-white shadow-sm text-[#141414]" : "text-[#6B6B66] hover:text-[#141414]"}`}>
                {l}
              </button>
            ))}
          </nav>
          <label className={`ml-auto cursor-pointer px-4 py-2 rounded-md text-[13px] font-medium text-white transition-opacity hover:opacity-90 ${uploading ? "opacity-50 pointer-events-none" : ""}`}
            style={{ background: ACCENT }}>
            {uploading ? "Processing…" : "Upload a report"}
            <input type="file" accept=".pdf,.csv,.xlsx" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) { doUpload(e.target.files[0]); e.target.value = ""; } }} />
          </label>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        {demoLoading && (
          <div className={`${card} p-4 text-sm text-[#6B6B66]`}>Loading the demonstration portfolio…</div>
        )}

        {meta && meta.strategies.length > 0 && (
          <div className={`${card} px-4 py-3 flex flex-wrap items-center gap-x-8 gap-y-2`}>
            {[["Strategy", "strategies", meta.strategies], ["Geography", "geographies", meta.geographies], ["Vintage year", "vintages", meta.vintages]].map(([label, key, opts]: any) => (
              <div key={key} className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] uppercase tracking-[0.1em] text-[#9A9A94] font-semibold mr-1">{label}</span>
                {opts.map((o: any) => (
                  <Pill key={o} label={String(o)} active={sel[key].includes(o)} onClick={() => toggle(key, o)} />
                ))}
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {tab === "dash" && kpis && !kpis.empty && (
            <motion.div key="dash" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SectionHead title="Portfolio vital signs"
                sub={`As of ${kpis.as_of?.slice(0, 10)} · ${kpis.n_funds} funds in view · euro-denominated metrics are weighted by Net Asset Value`} />
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Kpi label="Total Net Asset Value (NAV)" value={`€${kpis.total_nav.toLocaleString()}m`} delta={deltas.nav} goodWhenUp dSuffix="m" delay={0} />
                <Kpi label="Weighted Average Yield" value={kpis.wtd_yield} suffix="%" delta={deltas.wy} goodWhenUp dSuffix=" points" delay={0.05} />
                <Kpi label="Average Leverage (Net Debt / EBITDA)" value={kpis.avg_leverage} suffix="x" delta={deltas.lev} goodWhenUp={false} dSuffix="x" delay={0.1} />
                <Kpi label="Average Interest Coverage" value={kpis.avg_coverage} suffix="x" delta={deltas.cov} goodWhenUp dSuffix="x" delay={0.15} />
                <Kpi label="Weighted Default Rate" value={kpis.wtd_default} suffix="%" delta={null} goodWhenUp={false} delay={0.2} />
              </div>

              <SectionHead title="Watchlist"
                sub="Automatic flag: leverage rising and interest coverage falling for two or more consecutive quarters. A red marker means the fund is also close to a covenant limit." />
              <div className="space-y-3">
                {watch.length === 0 && (
                  <div className={`${card} p-4 text-sm`} style={{ color: ACCENT }}>No funds currently flagged — portfolio trends look healthy.</div>
                )}
                {watch.map((w) => (
                  <motion.div key={w.fund_id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                    className={`${card} p-4 border-l-4`}
                    style={{ borderLeftColor: w.severity === "red" ? RED : AMBER }}>
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-semibold">{w.fund_name} <span className="text-[#6B6B66] font-normal">({w.fund_id})</span></span>
                      <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full"
                        style={{ color: w.severity === "red" ? RED : AMBER, background: w.severity === "red" ? "#B4232A14" : "#9A670014" }}>
                        {w.severity === "red" ? "Covenant risk" : "Deteriorating trend"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-[#3d3d3a]">
                      Leverage {w.leverage_from}x → <b>{w.leverage_to}x</b> while coverage {w.coverage_from}x → <b>{w.coverage_to}x</b> · default rate {w.default_rate}%
                      {w.covenant_limit && <span style={{ color: RED }} className="font-medium"> · {w.covenant_headroom}x from its {w.covenant_limit}x leverage covenant</span>}
                    </p>
                  </motion.div>
                ))}
              </div>

              <SectionHead title="Trends" sub="Total portfolio value over time, and the per-fund leverage-versus-coverage view." />
              <div className="grid md:grid-cols-2 gap-6">
                <div className={`${card} p-5`}>
                  <h3 className="font-medium text-sm mb-3">Total Net Asset Value (€ millions)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={ts?.nav_trend ?? []}>
                      <CartesianGrid stroke="#EDEDE8" />
                      <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(0, 10)} stroke="#9A9A94" fontSize={11} />
                      <YAxis stroke="#9A9A94" fontSize={11} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E4E4DE", borderRadius: 8 }} labelFormatter={(d) => String(d).slice(0, 10)} />
                      <Line type="monotone" dataKey="nav" name="Net Asset Value" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className={`${card} p-5`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-sm">Fund deep-dive: Leverage versus Coverage</h3>
                    <select value={deep} onChange={(e) => setDeep(e.target.value)}
                      className="bg-white border border-[#D8D8D2] rounded-md px-2 py-1 text-sm">
                      {Object.keys(ts?.funds ?? {}).sort().map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={deepData}>
                      <CartesianGrid stroke="#EDEDE8" />
                      <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(0, 10)} stroke="#9A9A94" fontSize={11} />
                      <YAxis stroke="#9A9A94" fontSize={11} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E4E4DE", borderRadius: 8 }} labelFormatter={(d) => String(d).slice(0, 10)} />
                      <Legend />
                      <Line type="monotone" dataKey="leverage" name="Leverage (x)" stroke={RED} strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="coverage" name="Interest Coverage (x)" stroke={ACCENT} strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                  <p className="mt-2 text-[11px] text-[#9A9A94]">When leverage climbs while coverage falls, that is the classic credit warning pattern.</p>
                </div>
              </div>

              <SectionHead title="Fund by fund" sub="Latest quarter. Covenant headroom is shown where disclosed in the General Partner reports." />
              <div className={`${card} overflow-x-auto`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#9A9A94] border-b border-[#E4E4DE]">
                      {["Fund", "Name", "Strategy", "Net Asset Value (€m)", "Yield (%)", "Leverage (x)", "Coverage (x)", "Defaults (%)", "Covenant headroom"].map((h) => (
                        <th key={h} className="px-4 py-3 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {funds.map((f) => (
                      <tr key={f.fund_id} className="border-b border-[#F0F0EB] hover:bg-[#FAFAF7] transition">
                        <td className="px-4 py-2.5 font-medium" style={{ color: ACCENT }}>{f.fund_id}</td>
                        <td className="px-4 py-2.5">{f.fund_name}</td>
                        <td className="px-4 py-2.5 text-[#6B6B66]">{f.strategy}</td>
                        <td className="px-4 py-2.5">{f.nav_eur_m}</td>
                        <td className="px-4 py-2.5">{f.yield_pct}</td>
                        <td className="px-4 py-2.5">{f.leverage}</td>
                        <td className="px-4 py-2.5">{f.coverage}</td>
                        <td className="px-4 py-2.5">{f.default_rate_pct}</td>
                        <td className="px-4 py-2.5"
                          style={{ color: f.covenant_limit !== "" && f.covenant_headroom <= 0.3 ? RED : "#6B6B66", fontWeight: f.covenant_limit !== "" && f.covenant_headroom <= 0.3 ? 600 : 400 }}>
                          {f.covenant_limit !== "" ? `${f.covenant_headroom}x to ${f.covenant_limit}x limit` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {tab === "dash" && kpis?.empty && !demoLoading && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`${card} mt-8 p-12 text-center`}>
              <p className="text-lg font-semibold">Start by uploading a report.</p>
              <p className="mt-2 text-sm text-[#6B6B66] max-w-md mx-auto">
                Upload a General Partner report (PDF) or a data extract (CSV, XLSX).
                CreditLens validates every row, and you commit the approved data to build the portfolio.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <label className="cursor-pointer px-5 py-2.5 rounded-md text-white text-sm font-medium hover:opacity-90 transition-opacity" style={{ background: ACCENT }}>
                  Upload a report
                  <input type="file" accept=".pdf,.csv,.xlsx" className="hidden"
                    onChange={(e) => { if (e.target.files?.[0]) { doUpload(e.target.files[0]); e.target.value = ""; } }} />
                </label>
                <button onClick={loadDemo}
                  className="px-5 py-2.5 rounded-md border border-[#D8D8D2] text-sm font-medium hover:border-[#141414] transition-colors">
                  Load demonstration data
                </button>
              </div>
            </motion.div>
          )}

          {tab === "quality" && (
            <motion.div key="quality" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SectionHead title="Review Queue — can you trust these numbers?"
                sub="Every incoming row passes a validation gate. Repairable issues are corrected and loaded; rows that cannot be trusted are held here with plain-language reasons — never silently dropped, never silently corrected." />
              <div className="flex flex-wrap gap-2 text-[12px] mb-4">
                {["Date parsing — ISO, German, quarter formats", "Type coercion — comma decimals, placeholder text", "Range checks — catches unit errors", "Duplicate removal"].map((s) => (
                  <span key={s} className="px-3 py-1 rounded-full border border-[#E4E4DE] text-[#6B6B66] bg-white">{s}</span>
                ))}
              </div>
              <div className={`${card} overflow-x-auto`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-[0.08em] text-[#9A9A94] border-b border-[#E4E4DE]">
                      <th className="px-4 py-3 font-semibold">Source file</th><th className="px-4 py-3 font-semibold">Reason held</th>
                      <th className="px-4 py-3 font-semibold">Fund</th><th className="px-4 py-3 font-semibold">Reporting date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rejected.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-[#6B6B66]">No rows in the queue — all inputs passed validation.</td></tr>
                    )}
                    {rejected.map((r, i) => (
                      <tr key={i} className="border-b border-[#F0F0EB]">
                        <td className="px-4 py-2.5 text-[#6B6B66]">{r.source_file}</td>
                        <td className="px-4 py-2.5" style={{ color: RED }}>{r.reason}</td>
                        <td className="px-4 py-2.5">{r.fund_id ?? r.FundID}</td>
                        <td className="px-4 py-2.5">{r.reporting_date ?? r.Period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 text-sm italic text-[#9A9A94]">A pipeline is only as good as the trust people can put in its output.</p>
            </motion.div>
          )}

          {tab === "ask" && (
            <motion.div key="ask" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <SectionHead title="Ask the Documents"
                sub="Answers are generated only from retrieved report passages, with source citations. Uploaded PDF reports join the searchable index automatically." />
              <div className="flex flex-wrap gap-2 mb-3">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => doAsk(s)}
                    className="px-3 py-1.5 rounded-full text-[12px] border border-[#D8D8D2] bg-white text-[#3d3d3a] hover:border-[#0E5A4A] hover:text-[#0E5A4A] transition">
                    {s}
                  </button>
                ))}
              </div>
              <div className={`${card} p-4 min-h-[320px] space-y-4`}>
                {chat.length === 0 && !asking && (
                  <p className="text-sm text-[#9A9A94] text-center pt-20">No questions yet — click a suggestion above or type your own.</p>
                )}
                {chat.map((m, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={m.role === "user" ? "text-right" : ""}>
                    <div className={`inline-block max-w-[80%] text-left rounded-xl px-4 py-3 text-sm border ${
                      m.role === "user" ? "bg-[#0E5A4A0d] border-[#0E5A4A33]" : "bg-[#F6F6F2] border-[#E4E4DE]"}`}>
                      <p className="whitespace-pre-wrap">{m.text}</p>
                      {m.sources?.length > 0 && (
                        <details className="mt-2 text-xs text-[#6B6B66]">
                          <summary className="cursor-pointer hover:text-[#0E5A4A]">Evidence ({m.sources.length} passages)</summary>
                          {m.sources.map((s: any, j: number) => (
                            <p key={j} className="mt-2 border-l-2 pl-2" style={{ borderColor: "#0E5A4A55" }}>
                              <b>{s.source}</b> · passage {s.chunk}<br />{s.text}
                            </p>
                          ))}
                        </details>
                      )}
                    </div>
                  </motion.div>
                ))}
                {asking && <p className="text-sm text-[#6B6B66] animate-pulse">Retrieving passages and composing the answer…</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAsk()}
                  placeholder="Your question about the General Partner reports…"
                  className="flex-1 rounded-md bg-white border border-[#D8D8D2] focus:border-[#0E5A4A] outline-none px-4 py-3 text-sm transition-colors" />
                <button onClick={() => doAsk()} className="px-6 rounded-md text-white font-medium hover:opacity-90 transition-opacity" style={{ background: ACCENT }}>Ask</button>
              </div>
              <p className="mt-2 text-[11px] text-[#9A9A94]">Answers are generated from retrieved passages — always validate figures against the source document before using them in a decision.</p>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {receipt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeReceipt}>
              <motion.div initial={{ scale: 0.95, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }} onClick={(e) => e.stopPropagation()}
                className={`${card} p-6 w-[460px] max-h-[85vh] overflow-auto`}>
                <h3 className="text-lg font-semibold">Processing receipt</h3>
                <p className="text-xs text-[#6B6B66] mt-0.5">{receipt.filename}</p>

                {receipt.type === "csv" && !receipt.error && (
                  <div className="mt-3 flex items-center gap-1 text-[11px] font-medium">
                    {["Validate", "Onboard", "Commit"].map((s, i) => (
                      <div key={s} className="flex items-center gap-1">
                        <span className="px-2.5 py-1 rounded-full border"
                          style={step > i ? { color: ACCENT, borderColor: "#0E5A4A55", background: "#0E5A4A0d" } : { color: "#9A9A94", borderColor: "#E4E4DE" }}>
                          {i + 1} · {s}
                        </span>
                        {i < 2 && <span className="text-[#D8D8D2]">→</span>}
                      </div>
                    ))}
                  </div>
                )}

                {receipt.error && <p className="mt-4 text-sm" style={{ color: RED }}>{receipt.error}</p>}

                {receipt.type === "csv" && !receipt.error && (
                  <div className="mt-4 space-y-2 text-sm">
                    <p><b>{receipt.clean_rows.length}</b> rows validated</p>
                    <p><b>{receipt.rejected_rows.length}</b> rows held for review — see the Review Queue</p>
                    {receipt.rejected_rows.slice(0, 5).map((r: any, i: number) => (
                      <p key={i} className="text-xs pl-2 border-l-2" style={{ color: RED, borderColor: RED }}>{r.reason}</p>
                    ))}

                    {!commitResult?.ok && !commitResult?.needs_onboarding && (
                      <button onClick={doCommit} disabled={committing || receipt.clean_rows.length === 0}
                        className="mt-3 w-full py-2.5 rounded-md border font-medium transition disabled:opacity-50"
                        style={{ borderColor: ACCENT, color: ACCENT }}>
                        {committing ? "Committing…" : `Commit ${receipt.clean_rows.length} rows to the portfolio`}
                      </button>
                    )}

                    {commitResult?.needs_onboarding && (
                      <div className="mt-3 space-y-2 text-xs">
                        <p style={{ color: AMBER }}>New funds — register their master data first:</p>
                        {commitResult.needs_onboarding.map((fid: string) => (
                          <div key={fid} className="border border-[#E4E4DE] rounded-md p-2.5 space-y-1.5">
                            <p className="font-medium" style={{ color: ACCENT }}>{fid}</p>
                            {[["fund_name", "Fund name"], ["strategy", "Strategy (Senior / Subordinated / Opportunistic)"], ["geography", "Geography"], ["vintage_year", "Vintage year"]].map(([field, ph]) => (
                              <input key={field} placeholder={ph}
                                className="w-full bg-white border border-[#D8D8D2] focus:border-[#0E5A4A] outline-none rounded px-2 py-1.5 transition-colors"
                                onChange={(e) => setOnboarding((o: any) => ({ ...o, [fid]: { ...o[fid], [field]: e.target.value } }))} />
                            ))}
                          </div>
                        ))}
                        <button onClick={doCommit} disabled={committing}
                          className="w-full py-2.5 rounded-md text-white font-medium disabled:opacity-50" style={{ background: ACCENT }}>
                          {committing ? "Committing…" : "Onboard and commit"}
                        </button>
                      </div>
                    )}

                    {commitResult?.ok && (
                      <p className="mt-3 text-sm" style={{ color: ACCENT }}>
                        {commitResult.committed} rows committed{commitResult.onboarded?.length ? ` · onboarded: ${commitResult.onboarded.join(", ")}` : ""} — the dashboard has been updated.
                      </p>
                    )}
                  </div>
                )}

                {receipt.type === "pdf" && (
                  <div className="mt-4 space-y-2 text-sm">
                    <p><b>{Object.keys(receipt.extracted).length}</b> metrics recognised in the document</p>
                    <pre className="text-xs bg-[#F6F6F2] border border-[#E4E4DE] rounded-md p-3 overflow-auto">{JSON.stringify(receipt.extracted, null, 2)}</pre>
                    <p><b>{receipt.chunks_indexed}</b> passages indexed — ask about this document in Ask the Documents</p>
                  </div>
                )}

                <button onClick={closeReceipt}
                  className="mt-5 w-full py-2 rounded-md border border-[#D8D8D2] font-medium hover:border-[#141414] transition-colors">Done</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-16 pt-6 border-t border-[#E4E4DE] text-xs text-[#9A9A94]">
          CreditLens — built by <a className="underline hover:text-[#141414]" href="https://srikarkodi.dev">Srikar Kodi</a> · <a className="underline hover:text-[#141414]" href="https://github.com/Namidok/CreditLens">GitHub</a> · synthetic data · prototype: SQLite + FastAPI + Next.js · production path: Azure SQL + Power BI + Azure OpenAI
        </footer>
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}