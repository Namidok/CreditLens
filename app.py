"""CreditLens — Private Credit Portfolio Monitor"""
import sqlite3
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

st.set_page_config(page_title="CreditLens", page_icon="🔍", layout="wide")

# ---------- LOAD ----------
@st.cache_data
def load():
    con = sqlite3.connect("portfolio.db")
    funds = pd.read_sql("SELECT * FROM funds", con)
    vals = pd.read_sql("SELECT * FROM valuations", con, parse_dates=["reporting_date"])
    con.close()
    return funds, vals.merge(funds, on="fund_id")

funds, df = load()

st.title("🔍 CreditLens")
st.caption("Private Credit Portfolio Monitor — synthetic demo data · built by Srikar Kodi")

# ---------- SIDEBAR FILTERS ----------
with st.sidebar:
    st.header("Filters")
    strat = st.multiselect("Strategy", sorted(df.strategy.unique()),
                           default=sorted(df.strategy.unique()))
    geo = st.multiselect("Geography", sorted(df.geography.unique()),
                         default=sorted(df.geography.unique()))
    vint = st.multiselect("Vintage", sorted(df.vintage_year.unique()),
                          default=sorted(df.vintage_year.unique()))

f = df[df.strategy.isin(strat) & df.geography.isin(geo) & df.vintage_year.isin(vint)]

tab1, tab2, tab3 = st.tabs(["📊 Portfolio Dashboard", "🔍 Data Quality", "🤖 Ask the Documents"])

# ================= TAB 1: DASHBOARD =================
with tab1:
    if f.empty:
        st.warning("No funds match the current filters.")
        st.stop()

    latest_q = f.reporting_date.max()
    latest = f[f.reporting_date == latest_q]
    w = latest.nav_eur_m / latest.nav_eur_m.sum()   # NAV weights

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Total NAV", f"€{latest.nav_eur_m.sum():,.0f}m")
    c2.metric("Wtd Avg Yield", f"{(latest.yield_pct * w).sum():.1f}%")
    c3.metric("Avg Leverage", f"{latest.leverage.mean():.1f}x")
    c4.metric("Avg Coverage", f"{latest.coverage.mean():.1f}x")
    c5.metric("Wtd Default Rate", f"{(latest.default_rate_pct * w).sum():.1f}%")
    st.caption(f"As of {latest_q.date()} · {latest.fund_id.nunique()} funds in view")

    # ---------- WATCHLIST: leverage ↑ AND coverage ↓ for 2+ consecutive quarters ----------
    st.subheader("⚠️ Watchlist")
    flagged = []
    for fid, g in f.sort_values("reporting_date").groupby("fund_id"):
        if len(g) >= 3:
            lev_d = g.leverage.diff().dropna().tail(2)
            cov_d = g.coverage.diff().dropna().tail(2)
            if (lev_d > 0).all() and (cov_d < 0).all():
                last = g.iloc[-1]
                flagged.append(
                    f"**{last.fund_name}** ({fid}) — leverage rising "
                    f"({g.leverage.iloc[-3]:.1f}x → {last.leverage:.1f}x) while coverage falling "
                    f"({g.coverage.iloc[-3]:.1f}x → {last.coverage:.1f}x). "
                    f"Default rate: {last.default_rate_pct:.1f}%."
                )
    if flagged:
        for msg in flagged:
            st.error("🔴 " + msg)
    else:
        st.success("No funds currently flagged.")

    # ---------- TRENDS ----------
    left, right = st.columns(2)
    with left:
        nav_trend = f.groupby("reporting_date", as_index=False).nav_eur_m.sum()
        fig = px.line(nav_trend, x="reporting_date", y="nav_eur_m", markers=True,
                      title="Total Portfolio NAV (€m)")
        st.plotly_chart(fig, use_container_width=True)

        fig = px.bar(latest.groupby("strategy", as_index=False).nav_eur_m.sum(),
                     x="strategy", y="nav_eur_m", title=f"NAV by Strategy (as of {latest_q.date()})")
        st.plotly_chart(fig, use_container_width=True)

    with right:
        sel = st.selectbox("Fund deep-dive", sorted(f.fund_id.unique()),
                           index=sorted(f.fund_id.unique()).index("F003")
                           if "F003" in f.fund_id.unique() else 0)
        g = f[f.fund_id == sel].sort_values("reporting_date")
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=g.reporting_date, y=g.leverage,
                                 name="Leverage (x)", mode="lines+markers"))
        fig.add_trace(go.Scatter(x=g.reporting_date, y=g.coverage,
                                 name="Coverage (x)", mode="lines+markers"))
        fig.update_layout(title=f"{sel}: Leverage vs Coverage — the danger pattern")
        st.plotly_chart(fig, use_container_width=True)

        fig = px.line(g, x="reporting_date", y="yield_pct", markers=True,
                      title=f"{sel}: Gross Yield (%)")
        st.plotly_chart(fig, use_container_width=True)

    # ---------- FUND TABLE ----------
    st.subheader("Fund-by-Fund (latest quarter)")
    tbl = latest[["fund_id", "fund_name", "strategy", "geography",
                  "nav_eur_m", "yield_pct", "leverage", "coverage",
                  "default_rate_pct"]].sort_values("fund_id")
    st.dataframe(tbl, use_container_width=True, hide_index=True)

# ================= TAB 2: DATA QUALITY =================
with tab2:
    st.subheader("Validation Gate — Rejected Rows")
    st.markdown(
        "Every incoming row passes a validation gate: **date parsing** (ISO, German "
        "`dd.mm.yyyy`, and `Q3 2025` text formats), **type coercion** (comma decimals, "
        "`n/a` strings), **range checks** (e.g. yield must be 1–25% — catching unit "
        "errors like `0.118`), and **deduplication**. Repairable issues are fixed and "
        "loaded; unrepairable rows land here — with reasons — instead of silently "
        "corrupting the dashboard."
    )
    try:
        log = pd.read_csv("rejected_rows.log")
        st.error(f"{len(log)} rows rejected during last ingestion")
        st.dataframe(log, use_container_width=True, hide_index=True)
    except FileNotFoundError:
        st.success("No rejected rows — all inputs passed validation.")
    st.caption("Philosophy: the pipeline is only as good as the trust people can put in its output.")

# ================= TAB 3: RAG (placeholder tonight) =================
with tab3:
    st.subheader("🤖 Ask the Documents")
    st.info(
        "Coming next: RAG-powered Q&A over the GP quarterly reports (PDF). "
        "Documents are chunked and embedded (sentence-transformers → vector store), "
        "relevant passages retrieved per question, and answers returned **with source "
        "citations** — every number validated by a human. Try: "
        "*'What is Atlantic Mezzanine's leverage covenant?'*"
    )