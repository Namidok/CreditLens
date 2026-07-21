"""
CreditLens — Synthetic Data Generator
Creates deliberately messy GP report data: 2 CSVs (different schemas) + 2 PDFs (different layouts).
Every flaw is planted on purpose — see README/interview notes.
"""
import os
import random
import pandas as pd
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors

random.seed(42)
OUT = "raw_reports"
os.makedirs(OUT, exist_ok=True)

# ---------- 1. FUND UNIVERSE (dimension table — this one is clean) ----------
FUNDS = [
    ("F001", "Alpine Senior Credit I",      "Senior",        "Europe",        2021, 100),
    ("F002", "Nordic Direct Lending II",    "Senior",        "Europe",        2022, 150),
    ("F003", "Atlantic Mezzanine Partners", "Subordinated",  "North America", 2021,  80),
    ("F004", "Iberia Opportunistic Credit", "Opportunistic", "Europe",        2023,  60),
    ("F005", "US Mid-Market Senior III",    "Senior",        "North America", 2022, 120),
    ("F006", "RE Debt Fund Europe I",       "Senior",        "Europe",        2023,  90),
    ("F007", "Infra Debt Partners II",      "Subordinated",  "Global",        2021, 110),
    ("F008", "Energy Transition Credit I",  "Opportunistic", "Europe",        2024,  70),
]
pd.DataFrame(FUNDS, columns=[
    "fund_id", "fund_name", "strategy", "geography", "vintage_year", "commitment_eur_m"
]).to_csv(f"{OUT}/funds.csv", index=False)

QUARTERS = ["2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30"]

# Yield bands per strategy (the risk queue, visible in the data)
YIELD_BAND = {"Senior": (7.0, 8.5), "Subordinated": (9.0, 10.5), "Opportunistic": (11.0, 12.5)}

def healthy_series(fund_id, strategy, commitment):
    """4 quarters of gently-drifting healthy metrics."""
    nav = commitment * random.uniform(0.90, 0.97)
    y = random.uniform(*YIELD_BAND[strategy])
    lev = random.uniform(3.5, 4.8)
    cov = random.uniform(2.4, 3.5)
    rows = []
    for q in QUARTERS:
        nav *= random.uniform(1.005, 1.02)          # gentle NAV growth
        y   += random.uniform(-0.15, 0.15)
        lev += random.uniform(-0.15, 0.15)
        cov += random.uniform(-0.15, 0.15)
        dflt = round(max(0.0, random.uniform(-0.4, 1.0)), 1)
        rows.append([fund_id, q, round(nav, 1), round(y, 1),
                     round(lev, 1), round(cov, 1), dflt])
    return rows

# F003's planted deterioration — the dashboard's story
F003_ROWS = [
    ["F003", "2025-09-30", 76.0,  9.6, 4.2, 2.8, 0.0],
    ["F003", "2025-12-31", 75.2,  9.8, 4.6, 2.4, 0.0],
    ["F003", "2026-03-31", 73.5, 10.1, 5.1, 1.9, 1.5],
    ["F003", "2026-06-30", 71.8, 10.4, 5.4, 1.6, 2.5],
]

all_rows = {}
for fid, name, strat, geo, vint, comm in FUNDS:
    all_rows[fid] = F003_ROWS if fid == "F003" else healthy_series(fid, strat, comm)

# ---------- 2. BATCH 1 CSV (F001–F004) — schema A, German-flavored mess ----------
b1 = []
for fid in ["F001", "F002", "F003", "F004"]:
    for r in all_rows[fid]:
        fund_id, q, nav, y, lev, cov, dflt = r
        d = pd.Timestamp(q)
        date_str = d.strftime("%d.%m.%Y")           # PLANTED: German date format
        b1.append([fund_id, date_str, nav, y, lev, cov, dflt])

df1 = pd.DataFrame(b1, columns=["fund_id", "reporting_date", "nav_eur_m",
                                "yield_pct", "net_debt_ebitda",
                                "interest_coverage", "default_rate_pct"])
df1 = df1.astype(object)
# PLANTED FLAWS (in non-F003 rows so the story stays intact):
df1.loc[(df1.fund_id == "F001") & (df1.reporting_date == "30.09.2025"), "nav_eur_m"] = "97,4"   # comma decimal
df1.loc[(df1.fund_id == "F002") & (df1.reporting_date == "31.12.2025"), "interest_coverage"] = ""  # empty cell
df1.loc[(df1.fund_id == "F004") & (df1.reporting_date == "31.03.2026"), "yield_pct"] = 0.118    # unit error (should be 11.8)
df1.to_csv(f"{OUT}/valuations_batch1.csv", index=False)

# ---------- 3. BATCH 2 CSV (F005–F008) — schema B, different column names ----------
b2 = []
for fid in ["F005", "F006", "F007", "F008"]:
    for r in all_rows[fid]:
        fund_id, q, nav, y, lev, cov, dflt = r
        d = pd.Timestamp(q)
        period = f"Q{d.quarter} {d.year}"           # PLANTED: text period format
        b2.append([fund_id, period, nav, y, lev, cov, dflt])

df2 = pd.DataFrame(b2, columns=["FundID", "Period", "NAV (EUR m)", "Gross Yield %",
                                "Leverage Multiple", "ICR", "Defaults %"])
df2 = df2.astype(object)
# PLANTED FLAWS:
df2.loc[(df2.FundID == "F007") & (df2.Period == "Q4 2025"), "Leverage Multiple"] = "n/a"  # string in numeric col
df2 = pd.concat([df2, df2[(df2.FundID == "F005") & (df2.Period == "Q2 2026")]])           # duplicate row
df2 = df2[~((df2.FundID == "F008") & (df2.Period == "Q1 2026"))]                          # missing quarter
df2.to_csv(f"{OUT}/valuations_batch2.csv", index=False)

# ---------- 4. PDF REPORT A — Atlantic Mezzanine (structured layout, THE COVENANT) ----------
styles = getSampleStyleSheet()
doc = SimpleDocTemplate(f"{OUT}/GP_Report_AtlanticMezz_Q2_2026.pdf", pagesize=A4)
story = [
    Paragraph("Atlantic Mezzanine Partners — Quarterly Report Q2 2026", styles["Title"]),
    Spacer(1, 0.5 * cm),
    Paragraph("1. Portfolio Commentary", styles["Heading2"]),
    Paragraph(
        "During the quarter, the Fund's portfolio experienced continued pressure on borrower "
        "fundamentals. Weighted average leverage increased to 5.4x while interest coverage "
        "declined to 1.6x, driven primarily by margin compression in two consumer-sector "
        "borrowers. One additional borrower entered payment default during the period, "
        "bringing the portfolio default rate to 2.5%.", styles["BodyText"]),
    Spacer(1, 0.4 * cm),
    Paragraph("2. Key Metrics", styles["Heading2"]),
    Table([
        ["Metric", "Q1 2026", "Q2 2026"],
        ["NAV (EUR m)", "73.5", "71.8"],
        ["Gross Yield", "10.1%", "10.4%"],
        ["Net Leverage", "5.1x", "5.4x"],
        ["Interest Coverage", "1.9x", "1.6x"],
        ["Default Rate", "1.5%", "2.5%"],
    ], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1a3550")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
    ])),
    Spacer(1, 0.4 * cm),
    Paragraph("3. Covenant Position", styles["Heading2"]),
    Paragraph(
        "The Fund's facility agreements include a maximum net leverage covenant of 5.5x; "
        "as of Q2 2026, portfolio-weighted leverage stands at 5.4x, leaving limited headroom. "
        "The Investment Adviser is engaged in active dialogue with the two underperforming "
        "borrowers regarding potential amendments.", styles["BodyText"]),
]
doc.build(story)

# ---------- 5. PDF REPORT B — Alpine Senior (different layout: prose-style metrics) ----------
doc2 = SimpleDocTemplate(f"{OUT}/GP_Report_AlpineSenior_Q2_2026.pdf", pagesize=A4)
story2 = [
    Paragraph("Alpine Senior Credit I", styles["Title"]),
    Paragraph("Investor Letter — Second Quarter 2026", styles["Heading3"]),
    Spacer(1, 0.5 * cm),
    Paragraph("Dear Limited Partners,", styles["BodyText"]),
    Spacer(1, 0.2 * cm),
    Paragraph(
        "We are pleased to report another stable quarter for the Fund. Net asset value "
        "increased modestly quarter-over-quarter, and portfolio income remained in line "
        "with expectations, with a gross portfolio yield of approximately 7.8%. Borrower "
        "credit quality remains sound: portfolio net leverage stands at approximately 3.9x "
        "and weighted interest coverage at 3.1x. No borrowers are in default, and no "
        "covenant waivers were requested during the period.", styles["BodyText"]),
    Spacer(1, 0.2 * cm),
    Paragraph(
        "All facility-level covenants retain comfortable headroom, with the tightest — "
        "a minimum interest coverage requirement of 2.0x — remaining well above threshold. "
        "We continue to see attractive deployment opportunities in senior secured lending "
        "across the DACH region.", styles["BodyText"]),
    Spacer(1, 0.4 * cm),
    Paragraph("Sincerely,<br/>Alpine Credit Management GmbH", styles["BodyText"]),
]
doc2.build(story2)

print("✅ Generated in raw_reports/:")
for f in sorted(os.listdir(OUT)):
    print("   -", f)