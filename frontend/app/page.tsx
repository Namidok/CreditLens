"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const API = "";
const TEAL = "#00C2A8";

const card = "rounded-2xl border border-[#202A3D] bg-gradient-to-br from-[#151C2C] to-[#10151F] shadow-lg";
async function jget(path: string) { const r = await fetch(`${API}${path}`); return r.json(); }

function useFilters() {
  const [meta, setMeta] = useState<any>(null);
  const [sel, setSel] = useState<{ strategies: string[]; geographies: string[]; vintages: number[] }>({ strategies: [], geographies: [], vintages: [] });
  useEffect(() => { jget("/api/meta").then((m) => { setMeta(m); setSel({ strategies: m.strategies, geographies: m.geographies, vintages: m.vintages }); }); }, []);
  const qs = useMemo(() =>
    `?strategies=${sel.strategies.join(",")}&geographies=${sel.geographies.join(",")}&vintages=${sel.vintages.join(",")}`,
    [sel]);
  return { meta, setMeta, sel, setSel, qs };
}

function Pill({ active, label, onClick }: any) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
        active ? "bg-[#00C2A81a] border-[#00C2A8] text-[#00C2A8]"
               : "border-[#202A3D] text-[#7C8799] hover:border-[#3a4763]"}`}>
      {label}
    </button>
  );
}

function Kpi({ label, value, suffix = "", delay = 0 }: any) {
  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.45 }}
      whileHover={{ y: -3 }}
      className={`${card} p-5 border-t-2 border-t-[#00C2A833]`}>
      <div className="text-[11px] uppercase tracking-widest text-[#7C8799] font-semibold">{label}</div>
      <div className="mt-2 text-3xl font-bold font-mono" style={{ color: TEAL }}>{value}{suffix}</div>
    </motion.div>
  );
}

export default function Home() {
  const { meta, setMeta, sel, setSel, qs } = useFilters();
  const [kpis, setKpis] = useState<any>(null);
  const [watch, setWatch] = useState<any[]>([]);
  const [ts, setTs] = useState<any>(null);
  const [funds, setFunds] = useState<any[]>([]);
  const [rejected, setRejected] = useState<any[]>([]);
  const [tab, setTab] = useState<"dash" | "quality" | "ask">("dash");
  const [deep, setDeep] = useState("F003");

  // upload + commit state
  const [receipt, setReceipt] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>({});

  // ask state
  const [q, setQ] = useState("");
  const [chat, setChat] = useState<any[]>([]);
  const [asking, setAsking] = useState(false);

  function refetchAll() {
    jget(`/api/kpis${qs}`).then(setKpis);
    jget(`/api/watchlist${qs}`).then(setWatch);
    jget(`/api/timeseries${qs}`).then(setTs);
    jget(`/api/funds${qs}`).then(setFunds);
    jget(`/api/rejected`).then(setRejected);
  }

  useEffect(() => { if (meta) refetchAll(); }, [meta, qs]);

  async function doUpload(file: File) {
    setUploading(true);
    const fd = new FormData(); fd.append("file", file);
    const res = await fetch(`${API}/api/upload`, { method: "POST", body: fd });
    setReceipt(await res.json());
    setCommitResult(null);
    setOnboarding({});
    setUploading(false);
  }

  async function doCommit() {
    setCommitting(true);
    const res = await fetch(`${API}/api/commit`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: receipt.filename,
        rows: receipt.clean_rows,
        fund_meta: Object.keys(onboarding).length ? onboarding : null,
      }),
    });
    const data = await res.json();
    setCommitResult(data);
    setCommitting(false);
    if (data.ok) {
      const m = await jget("/api/meta");
      setMeta(m);
      setSel({ strategies: m.strategies, geographies: m.geographies, vintages: m.vintages });
    }
  }

  async function doAsk() {
    if (!q.trim()) return;
    const question = q; setQ(""); setAsking(true);
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

  const toggle = (key: "strategies" | "geographies" | "vintages", v: any) =>
    setSel((s: any) => ({ ...s, [key]: s[key].includes(v) ? s[key].filter((x: any) => x !== v) : [...s[key], v] }));

  const deepData = ts?.funds?.[deep] ?? ts?.funds?.[Object.keys(ts?.funds ?? {})[0]] ?? [];

  return (
    <main className="max-w-7xl mx-auto px-6 py-10">
      {/* HERO */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
        <h1 className="text-5xl font-extrabold tracking-tight">
          <span className="bg-gradient-to-r from-white to-[#00C2A8] bg-clip-text text-transparent">🔍 CreditLens</span>
        </h1>
        <p className="mt-2 text-[#7C8799]">
          Private Credit Portfolio Monitor — one screen for portfolio health, data trust, and document Q&A.
          <span className="text-[#4d5a70]"> Synthetic demo data · built by Srikar Kodi</span>
        </p>
      </motion.div>

      {/* TABS + UPLOAD */}
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-[#1E2635] bg-[#10151F] p-1">
          {[["dash", "📊 Portfolio"], ["quality", "🔍 Data Quality"], ["ask", "🤖 Ask the Documents"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k as any)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                tab === k ? "bg-[#1A2233] text-[#00C2A8]" : "text-[#7C8799] hover:text-white"}`}>
              {l}
            </button>
          ))}
        </div>
        <label className={`ml-auto cursor-pointer px-4 py-2 rounded-lg text-sm font-semibold border border-[#00C2A8] text-[#00C2A8] hover:bg-[#00C2A81a] transition ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          {uploading ? "Processing…" : "📤 Drop a GP report (PDF / CSV)"}
          <input type="file" accept=".pdf,.csv,.xlsx" className="hidden"
            onChange={(e) => { if (e.target.files?.[0]) { doUpload(e.target.files[0]); e.target.value = ""; } }} />
        </label>
      </div>

      {/* FILTERS */}
      {meta && (meta.strategies.length > 0) && (
        <div className={`${card} mt-6 p-4 flex flex-wrap gap-x-8 gap-y-3`}>
          {[["Strategy", "strategies", meta.strategies], ["Geography", "geographies", meta.geographies], ["Vintage", "vintages", meta.vintages]].map(([label, key, opts]: any) => (
            <div key={key} className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] uppercase tracking-widest text-[#7C8799] font-semibold mr-1">{label}</span>
              {opts.map((o: any) => (
                <Pill key={o} label={String(o)} active={sel[key as keyof typeof sel].includes(o as never)} onClick={() => toggle(key, o)} />
              ))}
            </div>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ============ DASHBOARD ============ */}
        {tab === "dash" && kpis && !kpis.empty && (
          <motion.div key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="mt-6 grid grid-cols-2 md:grid-cols-5 gap-4">
              <Kpi label="Total NAV" value={`€${kpis.total_nav.toLocaleString()}m`} delay={0} />
              <Kpi label="Wtd Avg Yield" value={kpis.wtd_yield} suffix="%" delay={0.05} />
              <Kpi label="Avg Leverage" value={kpis.avg_leverage} suffix="x" delay={0.1} />
              <Kpi label="Avg Coverage" value={kpis.avg_coverage} suffix="x" delay={0.15} />
              <Kpi label="Wtd Default Rate" value={kpis.wtd_default} suffix="%" delay={0.2} />
            </div>
            <p className="mt-2 text-xs text-[#4d5a70]">As of {kpis.as_of?.slice(0, 10)} · {kpis.n_funds} funds in view</p>

            {/* WATCHLIST */}
            <h2 className="mt-8 text-xl font-bold">⚠️ Watchlist</h2>
            <div className="mt-3 space-y-3">
              {watch.length === 0 && <div className={`${card} p-4 text-sm text-[#7C8799]`}>No funds currently flagged. ✅</div>}
              {watch.map((w) => (
                <motion.div key={w.fund_id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                  className={`${card} p-4 border-l-4 ${w.severity === "red" ? "border-l-red-500" : "border-l-amber-400"}`}>
                  <span className="font-bold">{w.severity === "red" ? "🔴" : "🟠"} {w.fund_name} ({w.fund_id})</span>
                  <span className="text-sm text-[#B8C2D0]"> — leverage rising ({w.leverage_from}x → {w.leverage_to}x) while coverage falling ({w.coverage_from}x → {w.coverage_to}x). Default rate: {w.default_rate}%.</span>
                  {w.covenant_limit && (
                    <span className="text-sm font-semibold text-red-400"> ⚡ {w.covenant_headroom}x from its {w.covenant_limit}x leverage covenant.</span>
                  )}
                </motion.div>
              ))}
            </div>

            {/* CHARTS */}
            <div className="mt-8 grid md:grid-cols-2 gap-6">
              <div className={`${card} p-5`}>
                <h3 className="font-semibold mb-3">Total Portfolio NAV (€m)</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={ts?.nav_trend ?? []}>
                    <CartesianGrid stroke="#1B2333" />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(0, 10)} stroke="#7C8799" fontSize={11} />
                    <YAxis stroke="#7C8799" fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#10151F", border: "1px solid #202A3D", borderRadius: 12 }} labelFormatter={(d) => String(d).slice(0, 10)} />
                    <Line type="monotone" dataKey="nav" stroke={TEAL} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className={`${card} p-5`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Fund deep-dive: Leverage vs Coverage</h3>
                  <select value={deep} onChange={(e) => setDeep(e.target.value)}
                    className="bg-[#10151F] border border-[#202A3D] rounded-lg px-2 py-1 text-sm">
                    {Object.keys(ts?.funds ?? {}).sort().map((f) => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={deepData}>
                    <CartesianGrid stroke="#1B2333" />
                    <XAxis dataKey="date" tickFormatter={(d) => String(d).slice(0, 10)} stroke="#7C8799" fontSize={11} />
                    <YAxis stroke="#7C8799" fontSize={11} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ background: "#10151F", border: "1px solid #202A3D", borderRadius: 12 }} labelFormatter={(d) => String(d).slice(0, 10)} />
                    <Legend />
                    <Line type="monotone" dataKey="leverage" name="Leverage (x)" stroke={TEAL} strokeWidth={2.5} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="coverage" name="Coverage (x)" stroke="#5B8DEF" strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* FUND TABLE */}
            <h2 className="mt-8 text-xl font-bold">Fund-by-Fund <span className="text-sm font-normal text-[#7C8799]">(latest quarter)</span></h2>
            <div className={`${card} mt-3 overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#7C8799] border-b border-[#202A3D]">
                    {["Fund", "Name", "Strategy", "NAV €m", "Yield %", "Lev x", "Cov x", "Def %", "Covenant headroom"].map((h) => (
                      <th key={h} className="px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {funds.map((f) => (
                    <tr key={f.fund_id} className="border-b border-[#161d2b] hover:bg-[#131926] transition">
                      <td className="px-4 py-2 font-mono text-[#00C2A8]">{f.fund_id}</td>
                      <td className="px-4 py-2">{f.fund_name}</td>
                      <td className="px-4 py-2 text-[#7C8799]">{f.strategy}</td>
                      <td className="px-4 py-2">{f.nav_eur_m}</td>
                      <td className="px-4 py-2">{f.yield_pct}</td>
                      <td className="px-4 py-2">{f.leverage}</td>
                      <td className="px-4 py-2">{f.coverage}</td>
                      <td className="px-4 py-2">{f.default_rate_pct}</td>
                      <td className={`px-4 py-2 ${f.covenant_limit !== "" && f.covenant_headroom <= 0.3 ? "text-red-400 font-semibold" : "text-[#7C8799]"}`}>
                        {f.covenant_limit !== "" ? `${f.covenant_headroom}x to ${f.covenant_limit}x limit` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}

        {/* ============ EMPTY STATE ============ */}
        {tab === "dash" && kpis?.empty && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`${card} mt-8 p-10 text-center`}>
            <p className="text-3xl">📭</p>
            <p className="mt-3 font-semibold">The portfolio is empty.</p>
            <p className="mt-1 text-sm text-[#7C8799]">
              Upload a GP report (PDF) or data extract (CSV) — CreditLens will validate it,
              and you can commit approved rows to build the portfolio.
            </p>
          </motion.div>
        )}

        {/* ============ DATA QUALITY ============ */}
        {tab === "quality" && (
          <motion.div key="quality" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h2 className="mt-8 text-xl font-bold">Can you trust these numbers?</h2>
            <p className="mt-2 text-[#B8C2D0] max-w-3xl text-sm leading-relaxed">
              Every incoming row passes a validation gate: date parsing (ISO, German dd.mm.yyyy, "Q3 2025"),
              type coercion (comma decimals, "n/a"), range checks (catching unit errors like 0.118), and deduplication.
              Repairable issues are fixed and loaded — unrepairable rows land here, <b>with reasons</b>, instead of silently corrupting the dashboard.
            </p>
            <div className={`${card} mt-4 overflow-x-auto`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-[#7C8799] border-b border-[#202A3D]">
                    <th className="px-4 py-3">Source file</th><th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Fund</th><th className="px-4 py-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rejected.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-6 text-center text-[#7C8799]">No rejected rows — all inputs passed validation. ✅</td></tr>
                  )}
                  {rejected.map((r, i) => (
                    <tr key={i} className="border-b border-[#161d2b]">
                      <td className="px-4 py-2 text-[#7C8799]">{r.source_file}</td>
                      <td className="px-4 py-2 text-red-300">{r.reason}</td>
                      <td className="px-4 py-2 font-mono">{r.fund_id ?? r.FundID}</td>
                      <td className="px-4 py-2">{r.reporting_date ?? r.Period}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-sm italic text-[#4d5a70]">Philosophy: the pipeline is only as good as the trust people can put in its output.</p>
          </motion.div>
        )}

        {/* ============ ASK ============ */}
        {tab === "ask" && (
          <motion.div key="ask" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <h2 className="mt-8 text-xl font-bold">🤖 Ask the Documents</h2>
            <p className="mt-2 text-sm text-[#B8C2D0] max-w-3xl">
              Answers come <b>only from retrieved passages, with source citations</b> — open-book, not closed-book.
              Try: <i>What is Atlantic Mezzanine's leverage covenant?</i>
            </p>
            <div className={`${card} mt-4 p-4 min-h-[280px] space-y-4`}>
              {chat.length === 0 && !asking && (
                <p className="text-sm text-[#4d5a70] text-center pt-16">No questions yet — ask anything about the indexed GP reports.</p>
              )}
              {chat.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={m.role === "user" ? "text-right" : ""}>
                  <div className={`inline-block max-w-[85%] text-left rounded-2xl px-4 py-3 text-sm ${
                    m.role === "user" ? "bg-[#00C2A81a] border border-[#00C2A855]" : "bg-[#131926] border border-[#202A3D]"}`}>
                    <p className="whitespace-pre-wrap">{m.text}</p>
                    {m.sources?.length > 0 && (
                      <details className="mt-2 text-xs text-[#7C8799]">
                        <summary className="cursor-pointer">📄 Evidence ({m.sources.length} passages)</summary>
                        {m.sources.map((s: any, j: number) => (
                          <p key={j} className="mt-2 border-l-2 border-[#00C2A855] pl-2">
                            <b>{s.source}</b> · chunk {s.chunk}<br />{s.text}
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                </motion.div>
              ))}
              {asking && <p className="text-sm text-[#7C8799] animate-pulse">Retrieving and synthesizing…</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && doAsk()}
                placeholder="Your question about the GP reports…"
                className="flex-1 rounded-xl bg-[#10151F] border border-[#202A3D] focus:border-[#00C2A8] outline-none px-4 py-3 text-sm" />
              <button onClick={doAsk} className="px-5 rounded-xl bg-[#00C2A8] text-[#06231f] font-bold hover:brightness-110 transition">Ask</button>
            </div>
            <p className="mt-2 text-xs text-[#4d5a70]">⚠️ AI-generated from retrieved passages — always validate figures against the source document.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ========== UPLOAD RECEIPT MODAL ========== */}
      <AnimatePresence>
        {receipt && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={closeReceipt}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`${card} p-6 w-[440px] max-h-[85vh] overflow-auto`}>
              <h3 className="text-lg font-bold">📋 Processing receipt</h3>
              <p className="text-xs text-[#7C8799] mt-1">{receipt.filename}</p>

              {receipt.error && <p className="mt-4 text-red-400 text-sm">{receipt.error}</p>}

              {receipt.type === "csv" && !receipt.error && (
                <div className="mt-4 space-y-2 text-sm">
                  <p>✅ <b>{receipt.clean_rows.length}</b> rows validated</p>
                  <p>🔴 <b>{receipt.rejected_rows.length}</b> rows rejected → <i>Data Quality</i></p>
                  {receipt.rejected_rows.slice(0, 5).map((r: any, i: number) => (
                    <p key={i} className="text-xs text-red-300 border-l-2 border-red-500 pl-2">{r.reason}</p>
                  ))}

                  {!commitResult?.ok && !commitResult?.needs_onboarding && (
                    <button onClick={doCommit} disabled={committing || receipt.clean_rows.length === 0}
                      className="mt-3 w-full py-2 rounded-xl border border-[#00C2A8] text-[#00C2A8] font-bold hover:bg-[#00C2A81a] transition disabled:opacity-50">
                      {committing ? "Committing…" : `✅ Commit ${receipt.clean_rows.length} rows to portfolio`}
                    </button>
                  )}

                  {commitResult?.needs_onboarding && (
                    <div className="mt-3 space-y-2 text-xs">
                      <p className="text-amber-400">⚠️ New funds — onboard them first (master data):</p>
                      {commitResult.needs_onboarding.map((fid: string) => (
                        <div key={fid} className="border border-[#202A3D] rounded-lg p-2 space-y-1">
                          <p className="font-mono text-[#00C2A8]">{fid}</p>
                          {[["fund_name", "Fund name"], ["strategy", "Strategy (Senior/Subordinated/Opportunistic)"], ["geography", "Geography"], ["vintage_year", "Vintage year"]].map(([field, ph]) => (
                            <input key={field} placeholder={ph}
                              className="w-full bg-[#0B0F17] border border-[#202A3D] rounded px-2 py-1"
                              onChange={(e) => setOnboarding((o: any) => ({ ...o, [fid]: { ...o[fid], [field]: e.target.value } }))} />
                          ))}
                        </div>
                      ))}
                      <button onClick={doCommit} disabled={committing}
                        className="w-full py-2 rounded-xl bg-[#00C2A8] text-[#06231f] font-bold disabled:opacity-50">
                        {committing ? "Committing…" : "Onboard + Commit"}
                      </button>
                    </div>
                  )}

                  {commitResult?.ok && (
                    <p className="mt-3 text-sm text-emerald-400">
                      ✅ {commitResult.committed} rows committed{commitResult.onboarded?.length ? ` · onboarded: ${commitResult.onboarded.join(", ")}` : ""} — dashboard updated.
                    </p>
                  )}
                </div>
              )}

              {receipt.type === "pdf" && (
                <div className="mt-4 space-y-2 text-sm">
                  <p>📊 <b>{Object.keys(receipt.extracted).length}</b> metrics extracted</p>
                  <pre className="text-xs bg-[#0B0F17] rounded-lg p-3 overflow-auto">{JSON.stringify(receipt.extracted, null, 2)}</pre>
                  <p>🤖 <b>{receipt.chunks_indexed}</b> chunks indexed → <i>Ask the Documents</i></p>
                </div>
              )}

              <button onClick={closeReceipt}
                className="mt-5 w-full py-2 rounded-xl bg-[#1A2233] border border-[#202A3D] font-bold hover:bg-[#202A3D] transition">Done</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className="mt-14 pt-6 border-t border-[#1E2635] text-xs text-[#4d5a70]">
        CreditLens — built by <a className="underline" href="https://srikarkodi.dev">Srikar Kodi</a> · <a className="underline" href="https://github.com/Namidok/CreditLens">GitHub</a> · synthetic data · prototype: SQLite + FastAPI + Next.js; production path: Azure SQL + Power BI + Azure OpenAI
      </footer>
    </main>
  );
}