"""
CreditLens — Ingestion & Validation Pipeline
Reads 2 differently-formatted CSV batches, normalizes to one canonical schema,
runs a validation gate, loads clean rows to SQLite, logs rejected rows with reasons.
"""
import re
import sqlite3
import pandas as pd

RAW = "raw_reports"
DB = "portfolio.db"
LOG = "rejected_rows.log"

CANONICAL = ["fund_id", "reporting_date", "nav_eur_m", "yield_pct",
             "leverage", "coverage", "default_rate_pct"]

# Validation ranges: (min, max) — inclusive sanity bounds
RANGES = {
    "nav_eur_m":        (0.1, 10000),
    "yield_pct":        (1.0, 25.0),    # catches the 0.118 unit error
    "leverage":         (0.5, 10.0),
    "coverage":         (0.5, 10.0),
    "default_rate_pct": (0.0, 20.0),
}

rejected = []

def reject(row_dict, source, reason):
    rejected.append({"source_file": source, "reason": reason, **row_dict})

def to_float(val):
    """Handle comma decimals, strings, blanks. Returns float or None."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if s == "" or s.lower() in ("n/a", "na", "none", "-"):
        return None
    s = s.replace(",", ".")            # German decimal comma → dot
    try:
        return float(s)
    except ValueError:
        return None

def parse_date(val):
    """Handle ISO, German dd.mm.yyyy, and 'Q3 2025' text. Returns ISO date str or None."""
    s = str(val).strip()
    m = re.match(r"^Q([1-4])\s+(\d{4})$", s)       # 'Q3 2025' → quarter-end date
    if m:
        q, year = int(m.group(1)), int(m.group(2))
        month_day = {1: "03-31", 2: "06-30", 3: "09-30", 4: "12-31"}[q]
        return f"{year}-{month_day}"
    for fmt in ("%Y-%m-%d", "%d.%m.%Y"):
        try:
            return pd.to_datetime(s, format=fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None

def validate_and_collect(df, source):
    """Run every row through the validation gate. Returns list of clean rows."""
    clean = []
    for _, row in df.iterrows():
        raw = row.to_dict()
        d = parse_date(raw["reporting_date"])
        if d is None:
            reject(raw, source, f"unparseable date: {raw['reporting_date']!r}")
            continue
        vals, bad = {}, None
        for col in ["nav_eur_m", "yield_pct", "leverage", "coverage", "default_rate_pct"]:
            v = to_float(raw[col])
            if v is None:
                bad = f"missing/invalid value in '{col}': {raw[col]!r}"
                break
            lo, hi = RANGES[col]
            if not (lo <= v <= hi):
                bad = (f"'{col}' value {v} outside sane range [{lo}, {hi}] "
                       f"— possible unit error")
                break
            vals[col] = v
        if bad:
            reject(raw, source, bad)
            continue
        clean.append([raw["fund_id"], d, vals["nav_eur_m"], vals["yield_pct"],
                      vals["leverage"], vals["coverage"], vals["default_rate_pct"]])
    return clean

# ---------- BATCH 1: schema A ----------
df1 = pd.read_csv(f"{RAW}/valuations_batch1.csv", dtype=object)
df1 = df1.rename(columns={"net_debt_ebitda": "leverage",
                          "interest_coverage": "coverage"})
clean1 = validate_and_collect(df1, "valuations_batch1.csv")

# ---------- BATCH 2: schema B → map to canonical ----------
df2 = pd.read_csv(f"{RAW}/valuations_batch2.csv", dtype=object)
df2 = df2.rename(columns={
    "FundID": "fund_id", "Period": "reporting_date", "NAV (EUR m)": "nav_eur_m",
    "Gross Yield %": "yield_pct", "Leverage Multiple": "leverage",
    "ICR": "coverage", "Defaults %": "default_rate_pct",
})
# Dedup BEFORE validation (log what we drop)
dupes = df2[df2.duplicated()]
for _, row in dupes.iterrows():
    reject(row.to_dict(), "valuations_batch2.csv", "exact duplicate row — dropped")
df2 = df2.drop_duplicates()
clean2 = validate_and_collect(df2, "valuations_batch2.csv")

# ---------- LOAD TO SQLITE ----------
clean_df = pd.DataFrame(clean1 + clean2, columns=CANONICAL)
funds_df = pd.read_csv(f"{RAW}/funds.csv")

con = sqlite3.connect(DB)
funds_df.to_sql("funds", con, if_exists="replace", index=False)
clean_df.to_sql("valuations", con, if_exists="replace", index=False)

# Window-function views (the SQL showpiece)
con.executescript("""
DROP VIEW IF EXISTS v_latest;
CREATE VIEW v_latest AS
SELECT * FROM (
    SELECT v.*,
           ROW_NUMBER() OVER (PARTITION BY fund_id ORDER BY reporting_date DESC) AS rn
    FROM valuations v
) WHERE rn = 1;

DROP VIEW IF EXISTS v_qoq;
CREATE VIEW v_qoq AS
SELECT fund_id, reporting_date,
       nav_eur_m,
       nav_eur_m - LAG(nav_eur_m)  OVER (PARTITION BY fund_id ORDER BY reporting_date) AS nav_change,
       leverage,
       leverage - LAG(leverage)    OVER (PARTITION BY fund_id ORDER BY reporting_date) AS leverage_change,
       coverage,
       coverage - LAG(coverage)    OVER (PARTITION BY fund_id ORDER BY reporting_date) AS coverage_change
FROM valuations;
""")
con.commit()
con.close()

# ---------- REJECTED ROWS LOG ----------
if rejected:
    pd.DataFrame(rejected).to_csv(LOG, index=False)

print(f"✅ Ingestion complete")
print(f"   Clean rows loaded : {len(clean_df)}")
print(f"   Rejected rows     : {len(rejected)}  → {LOG}")
print(f"   Database          : {DB} (tables: funds, valuations | views: v_latest, v_qoq)")