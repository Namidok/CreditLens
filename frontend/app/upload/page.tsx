"use client";
import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

const API = "";
const ACCENT = "#0E5A4A";
const RED = "#B4232A";
const AMBER = "#9A6700";
const card = "rounded-xl border border-[#E4E4DE] bg-white shadow-sm";

export default function UploadPage() {
  const [receipt, setReceipt] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);
  const [onboarding, setOnboarding] = useState<any>({});

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
      body: JSON.stringify({
        filename: receipt.filename, rows: receipt.clean_rows,
        fund_meta: Object.keys(onboarding).length ? onboarding : null,
      }),
    });
    setCommitResult(await res.json()); setCommitting(false);
  }

  function closeReceipt() { setReceipt(null); setCommitResult(null); setOnboarding({}); }

  const step = commitResult?.ok ? 3 : commitResult?.needs_onboarding ? 2 : 1;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 backdrop-blur bg-white/85 border-b border-[#E4E4DE]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="font-semibold tracking-tight">CreditLens</Link>
          <Link href="/dashboard" className="text-sm font-medium hover:opacity-80" style={{ color: ACCENT }}>
            View the portfolio →
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-20">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-semibold tracking-tight">Upload a report</h1>
          <p className="mt-3 text-[#6B6B66] leading-relaxed">
            Upload a General Partner report (PDF) or a data extract (CSV, XLSX).
            Every row passes the validation gate — clean data is staged for your review,
            problem rows are held with plain-language reasons.
          </p>

          <label className={`mt-8 block cursor-pointer ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
            <div className={`${card} border-2 border-dashed p-12 text-center hover:border-[#0E5A4A] transition-colors`}>
              <p className="font-medium">{uploading ? "Processing…" : "Choose a file"}</p>
              <p className="mt-1 text-sm text-[#9A9A94]">PDF, CSV or XLSX</p>
            </div>
            <input type="file" accept=".pdf,.csv,.xlsx" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) { doUpload(e.target.files[0]); e.target.value = ""; } }} />
          </label>

          <p className="mt-6 text-sm text-[#9A9A94]">
            After committing, view the results on the{" "}
            <Link href="/dashboard" className="underline hover:text-[#141414]">portfolio dashboard</Link>.
            Uploaded PDF reports also become searchable in Ask the Documents.
          </p>
        </motion.div>

        {/* RECEIPT MODAL */}
        <AnimatePresence>
          {receipt && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
              onClick={closeReceipt}>
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
                    <p><b>{receipt.rejected_rows.length}</b> rows held for review</p>
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
                      <div className="mt-3 text-sm" style={{ color: ACCENT }}>
                        <p>{commitResult.committed} rows committed{commitResult.onboarded?.length ? ` · onboarded: ${commitResult.onboarded.join(", ")}` : ""}.</p>
                        <Link href="/dashboard" className="mt-2 inline-block underline font-medium">View the portfolio →</Link>
                      </div>
                    )}
                  </div>
                )}

                {receipt.type === "pdf" && (
                  <div className="mt-4 space-y-2 text-sm">
                    <p><b>{Object.keys(receipt.extracted).length}</b> metrics recognised in the document</p>
                    <pre className="text-xs bg-[#F6F6F2] border border-[#E4E4DE] rounded-md p-3 overflow-auto">{JSON.stringify(receipt.extracted, null, 2)}</pre>
                    <p><b>{receipt.chunks_indexed}</b> passages indexed — ask about this document in Ask the Documents</p>
                    <Link href="/dashboard" className="inline-block underline font-medium" style={{ color: ACCENT }}>View the portfolio →</Link>
                  </div>
                )}

                <button onClick={closeReceipt}
                  className="mt-5 w-full py-2 rounded-md border border-[#D8D8D2] font-medium hover:border-[#141414] transition-colors">Done</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-16 pt-6 border-t border-[#E4E4DE] text-xs text-[#9A9A94]">
          CreditLens — built by <a className="underline hover:text-[#141414]" href="https://srikarkodi.dev">Srikar Kodi</a> · synthetic data
        </footer>
      </main>
    </div>
  );
}