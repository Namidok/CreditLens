"""CreditLens API — FastAPI backend wrapping the existing pipeline, DB, and RAG."""
import io
import re
import sqlite3
from contextlib import asynccontextmanager

import pandas as pd
import pdfplumber
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ingest import validate_dataframe, CANONICAL
import rag

COVENANTS = {"F003": 5.5}
STATE = {"rag_index": None}

@asynccontextmanager
async def lifespan(app: FastAPI):
    STATE["rag_index"] = rag.build_index("raw_reports")   # index once at boot
    yield

app = FastAPI(title="CreditLens API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

def q(sql, params=()):
    con = sqlite3.connect("portfolio.db")
    df = pd.read_sql(sql, con, params=params)
    con.close()
    return df

def portfolio_df():
    vals = q("SELECT * FROM valuations")
    funds = q("SELECT * FROM funds")
    return vals.merge(funds, on="fund_id")

# ---------- READ ENDPOINTS ----------
@app.get("/api/meta")
def meta():
    funds = q("SELECT * FROM funds")
    return {
        "strategies": sorted(funds.strategy.unique().tolist()),
        "geographies": sorted(funds.geography.unique().tolist()),
        "vintages": sorted(funds.vintage_year.unique().tolist()),
    }

def _filtered(strategies, geographies, vintages):
    df = portfolio_df()
    if strategies:
        df = df[df.strategy.isin(strategies.split(","))]
    if geographies:
        df = df[df.geography.isin(geographies.split(","))]
    if vintages:
        df = df[df.vintage_year.isin([int(v) for v in vintages.split(",")])]
    return df

@app.get("/api/kpis")
def kpis(strategies: str = "", geographies: str = "", vintages: str = ""):
    df = _filtered(strategies, geographies, vintages)
    if df.empty:
        return {"empty": True}
    latest = df[df.reporting_date == df.reporting_date.max()]
    w = latest.nav_eur_m / latest.nav_eur_m.sum()
    return {
        "empty": False,
        "as_of": str(latest.reporting_date.max()),
        "total_nav": round(float(latest.nav_eur_m.sum()), 1),
        "wtd_yield": round(float((latest.yield_pct * w).sum()), 1),
        "avg_leverage": round(float(latest.leverage.mean()), 1),
        "avg_coverage": round(float(latest.coverage.mean()), 1),
        "wtd_default": round(float((latest.default_rate_pct * w).sum()), 1),
        "n_funds": int(latest.fund_id.nunique()),
    }

@app.get("/api/funds")
def funds_table(strategies: str = "", geographies: str = "", vintages: str = ""):
    df = _filtered(strategies, geographies, vintages)
    if df.empty:
        return []
    latest = df[df.reporting_date == df.reporting_date.max()].copy()
    latest["covenant_limit"] = latest.fund_id.map(COVENANTS)
    latest["covenant_headroom"] = (latest.covenant_limit - latest.leverage).round(1)
    cols = ["fund_id", "fund_name", "strategy", "geography", "vintage_year",
            "nav_eur_m", "yield_pct", "leverage", "coverage",
            "default_rate_pct", "covenant_limit", "covenant_headroom"]
    return latest[cols].fillna("").sort_values("fund_id").to_dict(orient="records")

@app.get("/api/timeseries")
def timeseries(strategies: str = "", geographies: str = "", vintages: str = ""):
    df = _filtered(strategies, geographies, vintages)
    if df.empty:
        return {"nav_trend": [], "funds": {}}
    nav = (df.groupby("reporting_date", as_index=False).nav_eur_m.sum()
             .rename(columns={"reporting_date": "date", "nav_eur_m": "nav"}))
    per_fund = {
        fid: g.sort_values("reporting_date")[
            ["reporting_date", "nav_eur_m", "yield_pct", "leverage", "coverage"]
        ].rename(columns={"reporting_date": "date"}).to_dict(orient="records")
        for fid, g in df.groupby("fund_id")
    }
    return {"nav_trend": nav.to_dict(orient="records"), "funds": per_fund}

@app.get("/api/watchlist")
def watchlist(strategies: str = "", geographies: str = "", vintages: str = ""):
    df = _filtered(strategies, geographies, vintages)
    out = []
    for fid, g in df.sort_values("reporting_date").groupby("fund_id"):
        if len(g) >= 3:
            lev_d = g.leverage.diff().dropna().tail(2)
            cov_d = g.coverage.diff().dropna().tail(2)
            if (lev_d > 0).all() and (cov_d < 0).all():
                last = g.iloc[-1]
                lim = COVENANTS.get(fid)
                near = bool(lim) and (lim - last.leverage) <= 0.3
                out.append({
                    "fund_id": fid, "fund_name": last.fund_name,
                    "severity": "red" if near else "amber",
                    "leverage_from": round(float(g.leverage.iloc[-3]), 1),
                    "leverage_to": round(float(last.leverage), 1),
                    "coverage_from": round(float(g.coverage.iloc[-3]), 1),
                    "coverage_to": round(float(last.coverage), 1),
                    "default_rate": round(float(last.default_rate_pct), 1),
                    "covenant_limit": lim,
                    "covenant_headroom": round(lim - float(last.leverage), 1) if lim else None,
                })
    return out

@app.get("/api/rejected")
def rejected():
    try:
        return pd.read_csv("rejected_rows.log").fillna("").to_dict(orient="records")
    except FileNotFoundError:
        return []

# ---------- UPLOAD ----------
@app.post("/api/upload")
async def upload(file: UploadFile = File(...)):
    content = await file.read()
    name = file.filename or "upload"

    if name.endswith((".csv", ".xlsx")):
        raw = (pd.read_csv(io.BytesIO(content), dtype=object) if name.endswith(".csv")
               else pd.read_excel(io.BytesIO(content), dtype=object))
        COLMAP = {
            "fundid": "fund_id", "fund": "fund_id",
            "period": "reporting_date", "date": "reporting_date",
            "reportingdate": "reporting_date",
            "nav(eurm)": "nav_eur_m", "nav": "nav_eur_m", "naveurm": "nav_eur_m",
            "grossyield%": "yield_pct", "yield": "yield_pct", "yieldpct": "yield_pct",
            "leveragemultiple": "leverage", "netdebtebitda": "leverage",
            "leverage": "leverage",
            "icr": "coverage", "interestcoverage": "coverage", "coverage": "coverage",
            "defaults%": "default_rate_pct", "defaultrate": "default_rate_pct",
            "defaultratepct": "default_rate_pct",
        }
        raw.columns = [COLMAP.get(c.strip().lower().replace(" ", "").replace("_", ""), c)
                       for c in raw.columns]
        missing = [c for c in CANONICAL if c not in raw.columns]
        if missing:
            return {"type": "csv", "error": f"Could not map columns: {missing}"}
        clean, rej = validate_dataframe(raw[CANONICAL], name)
        return {"type": "csv", "filename": name,
                "clean_rows": clean.to_dict(orient="records"),
                "rejected_rows": rej.fillna("").to_dict(orient="records")}

    if name.endswith(".pdf"):
        with pdfplumber.open(io.BytesIO(content)) as pdf:
            text = "\n\n".join((p.extract_text() or "") for p in pdf.pages)
        flat = " ".join(text.split())
        patterns = {
            "nav_eur_m": r"(?:NAV|net asset value)[^\d]{0,40}([\d.,]+)",
            "yield_pct": r"(?:yield)[^\d]{0,40}([\d.,]+)\s*%",
            "leverage": r"(?:leverage|net debt)[^\d]{0,40}([\d.,]+)\s*x",
            "coverage": r"(?:coverage|ICR)[^\d]{0,40}([\d.,]+)\s*x",
            "default_rate_pct": r"(?:default)[^\d]{0,40}([\d.,]+)\s*%",
            "covenant": r"covenant.{0,250}",
        }
        extract = {}
        for k, pat in patterns.items():
            m = re.search(pat, flat, flags=re.IGNORECASE)
            if m:
                extract[k] = m.group(1) if m.groups() else m.group(0)
        n_chunks = rag.add_document(STATE["rag_index"], name, text)
        return {"type": "pdf", "filename": name, "extracted": extract,
                "chunks_indexed": n_chunks}

    return {"error": "Unsupported file type"}

# ---------- RAG ----------
class Question(BaseModel):
    question: str

@app.post("/api/ask")
def ask(body: Question):
    try:
        import streamlit as st  # not used; placeholder guard
    except Exception:
        pass
    import os
    key = os.environ.get("GROQ_API_KEY")
    if not key:
        # fall back to reading streamlit secrets file if present
        try:
            import tomllib
            with open(".streamlit/secrets.toml", "rb") as fh:
                key = tomllib.load(fh).get("GROQ_API_KEY")
        except Exception:
            key = None
    ans, sources = rag.answer(STATE["rag_index"], body.question, api_key=key)
    return {"answer": ans,
            "sources": [{"text": d, "source": m["source"], "chunk": m["chunk"]}
                        for d, m in sources]}