"""CreditLens — factory reset: wipe all data, keep empty schema so the API stays alive."""
import os
import shutil
import sqlite3

# 1. Wipe raw inputs
if os.path.isdir("raw_reports"):
    shutil.rmtree("raw_reports")
os.makedirs("raw_reports", exist_ok=True)

# 2. Wipe rejection log
if os.path.exists("rejected_rows.log"):
    os.remove("rejected_rows.log")

# 3. Recreate DB with EMPTY tables + views (API needs the schema to exist)
if os.path.exists("portfolio.db"):
    os.remove("portfolio.db")
con = sqlite3.connect("portfolio.db")
con.executescript("""
CREATE TABLE funds (
    fund_id TEXT, fund_name TEXT, strategy TEXT,
    geography TEXT, vintage_year INTEGER, commitment_eur_m REAL
);
CREATE TABLE valuations (
    fund_id TEXT, reporting_date TEXT, nav_eur_m REAL, yield_pct REAL,
    leverage REAL, coverage REAL, default_rate_pct REAL
);
CREATE VIEW v_latest AS
SELECT * FROM (
    SELECT v.*, ROW_NUMBER() OVER (PARTITION BY fund_id ORDER BY reporting_date DESC) AS rn
    FROM valuations v
) WHERE rn = 1;
CREATE VIEW v_qoq AS
SELECT fund_id, reporting_date, nav_eur_m,
       nav_eur_m - LAG(nav_eur_m) OVER (PARTITION BY fund_id ORDER BY reporting_date) AS nav_change,
       leverage,
       leverage - LAG(leverage) OVER (PARTITION BY fund_id ORDER BY reporting_date) AS leverage_change,
       coverage,
       coverage - LAG(coverage) OVER (PARTITION BY fund_id ORDER BY reporting_date) AS coverage_change
FROM valuations;
""")
con.commit()
con.close()
print("🧹 Factory reset complete: empty schema, no reports, no log.")
print("   Restore demo data anytime: python generate_data.py && python ingest.py")