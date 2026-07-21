# 🔍 CreditLens

**Private Credit Portfolio Monitor** — an end-to-end prototype that ingests messy
GP (General Partner) quarterly reports, validates and normalizes the data, and
monitors portfolio health on an interactive dashboard.

Built by [Srikar Kodi](https://srikarkodi.dev) · [LinkedIn](https://linkedin.com/in/srikar-kodi-046a631b2)

> **Why this exists:** In private credit fund-of-funds investing, every GP reports
> the same metrics (NAV, yield, leverage, coverage, defaults) in different formats —
> different schemas, different date conventions, different units. Before anyone can
> trust a dashboard, someone has to make the data trustworthy. CreditLens is a
> working miniature of that pipeline.

---

## Architecture

raw_reports/ (deliberately messy inputs)
├── valuations_batch1.csv ← schema A, German dates, comma decimals
├── valuations_batch2.csv ← schema B, text periods, "n/a", duplicates
├── GP_Report_AtlanticMezz.pdf ← structured GP report (tables + covenant)
└── GP_Report_AlpineSenior.pdf ← prose-style GP report (different layout)
│
▼
ingest.py — ETL + VALIDATION GATE
• schema normalization (2 formats → 1 canonical model)
• date parsing (ISO, dd.mm.yyyy, "Q3 2025")
• type coercion (comma decimals, "n/a" strings)
• range checks (catches unit errors, e.g. yield 0.118 vs 11.8)
• deduplication
→ clean rows → portfolio.db (SQLite)
→ bad rows → rejected_rows.log (with reasons)
│
▼
portfolio.db (SQLite)
• funds (dimension) + valuations (fact)
• v_latest — latest NAV per fund (ROW_NUMBER window function)
• v_qoq — quarter-over-quarter deltas (LAG window function)
│
▼
app.py — STREAMLIT DASHBOARD
• Tab 1: KPIs, trends, strategy/geo/vintage filters,
auto-watchlist (leverage ↑ + coverage ↓ = 🔴 flag)
• Tab 2: Data Quality — every rejected row, with its reason
• Tab 3: Ask the Documents — RAG Q&A over GP report PDFs (in progress)


## Run it locally

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python generate_data.py    # create synthetic messy inputs
python ingest.py           # ETL + validation → portfolio.db
streamlit run app.py       # dashboard at localhost:8501
```

## Design decisions (and honest limitations)

- **Synthetic data, deliberately ugly.** Real GP reports are confidential. The
  generator plants realistic flaws on purpose — inconsistent schemas, EU date/decimal
  conventions, unit errors, duplicates, a missing quarter — so the validation gate
  has something real to catch.
- **One planted story:** fund F003 deteriorates across four quarters (leverage
  4.2x → 5.4x while coverage falls 2.8x → 1.6x, against a 5.5x covenant). The
  watchlist rule catches it automatically — that's the point of a monitoring
  dashboard.
- **SQLite, not Postgres/SQL Server.** Right choice for a self-contained prototype;
  the schema and window-function views port directly to a production RDBMS.
- **Streamlit, not Power BI.** Same data model and dashboard thinking; in a
  Microsoft-stack environment this would be a Power BI report over the same star
  schema.
- **Repair vs. reject:** fixable issues (date formats, comma decimals) are
  normalized and loaded; unfixable ones (missing values, out-of-range numbers) are
  rejected *visibly* — never silently corrected, never silently dropped.

## What production would add

Airflow-scheduled ingestion · Postgres/Azure SQL · Azure OpenAI (in-tenant) for the
RAG layer · human-in-the-loop validation workflow for AI-extracted figures ·
authentication & audit logging.

---

*The guiding principle: a pipeline is only as good as the trust people can put in
its output.*