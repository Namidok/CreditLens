"use client";
import Link from "next/link";
import { motion } from "framer-motion";

const ACCENT = "#0E5A4A";

const STEPS = [
  {
    n: "01",
    title: "Ingest and validate",
    body: "Upload a General Partner report (PDF) or a data extract (CSV, XLSX). Every row passes a validation gate — date formats, unit errors, duplicates, missing values — before anything is trusted.",
  },
  {
    n: "02",
    title: "Review and commit",
    body: "Clean rows are staged, problem rows are quarantined with plain-language reasons. New funds are registered with their master data before their numbers can enter the portfolio.",
  },
  {
    n: "03",
    title: "Monitor and ask",
    body: "Portfolio health on one screen — valuations, yield, leverage, coverage, defaults — plus document questions answered only from the reports themselves, with cited sources.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* NAV */}
      <header className="border-b border-[#E8E8E4]">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <span className="font-semibold tracking-tight">CreditLens</span>
          <nav className="flex items-center gap-6 text-sm">
            <a href="https://github.com/Namidok/CreditLens" className="text-[#6B6B66] hover:text-[#141414] transition-colors">Source</a>
            <Link href="/dashboard"
              className="px-4 py-2 rounded-md text-white text-sm font-medium transition-opacity hover:opacity-90"
              style={{ background: ACCENT }}>
              Open the app
            </Link>
          </nav>
        </div>
      </header>

      {/* HERO */}
      <section className="max-w-5xl mx-auto px-6 pt-24 pb-20 w-full">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="text-sm font-medium" style={{ color: ACCENT }}>Private credit portfolio monitoring</p>
          <h1 className="mt-4 text-5xl leading-[1.1] font-semibold tracking-tight max-w-2xl">
            From inconsistent fund reports to numbers you can defend.
          </h1>
          <p className="mt-6 text-lg text-[#6B6B66] max-w-xl leading-relaxed">
            Every General Partner reports the same metrics in a different format.
            CreditLens validates the data, quarantines what cannot be trusted,
            and answers questions about the underlying documents — with sources.
          </p>
          <div className="mt-10 flex items-center gap-4">
            <Link href="/upload"
              className="px-6 py-3 rounded-md text-white font-medium transition-opacity hover:opacity-90"
              style={{ background: ACCENT }}>
              Get started
            </Link>
            <Link href="/dashboard"
              className="px-6 py-3 rounded-md border border-[#D8D8D2] font-medium text-[#141414] hover:border-[#141414] transition-colors">
              Explore with demo data
            </Link>
          </div>
          <p className="mt-4 text-xs text-[#9A9A94]">Prototype · synthetic data only · built by Srikar Kodi</p>
        </motion.div>
      </section>

      {/* STEPS */}
      <section className="border-t border-[#E8E8E4]">
        <div className="max-w-5xl mx-auto px-6 py-20 grid md:grid-cols-3 gap-12">
          {STEPS.map((s, i) => (
            <motion.div key={s.n} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: i * 0.08, duration: 0.4 }}>
              <p className="text-sm font-mono" style={{ color: ACCENT }}>{s.n}</p>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-[15px] text-[#6B6B66] leading-relaxed">{s.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PRINCIPLE */}
      <section className="border-t border-[#E8E8E4]">
        <div className="max-w-5xl mx-auto px-6 py-16">
          <p className="text-xl max-w-2xl leading-relaxed text-[#141414]">
            “A pipeline is only as good as the trust people can put in its output.”
          </p>
          <p className="mt-3 text-sm text-[#9A9A94]">
            The design principle behind CreditLens: repairable issues are fixed and loaded,
            unrepairable rows are rejected visibly — never silently.
          </p>
        </div>
      </section>

      <footer className="mt-auto border-t border-[#E8E8E4]">
        <div className="max-w-5xl mx-auto px-6 py-8 text-xs text-[#9A9A94] flex flex-wrap gap-x-6 gap-y-2">
          <span>CreditLens — built by <a className="underline hover:text-[#141414]" href="https://srikarkodi.dev">Srikar Kodi</a></span>
          <span><a className="underline hover:text-[#141414]" href="https://github.com/Namidok/CreditLens">GitHub</a></span>
          <span>Prototype: SQLite + FastAPI + Next.js · Production path: Azure SQL + Power BI + Azure OpenAI</span>
        </div>
      </footer>
    </div>
  );
}