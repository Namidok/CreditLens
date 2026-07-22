"""CreditLens — Private Credit Portfolio Monitor"""
import io
import re
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

# ---------- SIDEBAR: FILTERS + UPLOAD ----------
with st.sidebar:
    st.header("Filters")
    strat = st.multiselect("Strategy", sorted(df.strategy.unique()),
                           default=sorted(df.strategy.unique()))
    geo = st.multiselect("Geography", sorted(df.geography.unique()),
                         default=sorted(df.geography.unique()))
    vint = st.multiselect("Vintage", sorted(df.vintage_year.unique()),
                          default=sorted(df.vintage_year.unique()))

    st.divider()
    st.header("📤 Upload a Report")
    up = st.file_uploader(
        "Test the pipeline with your own file",
        type=["csv", "xlsx", "pdf"],
        help="CSV/Excel: runs through the validation gate. PDF: metric extraction."
    )

f = df[df.strategy.isin(strat) & df.geography.isin(geo) & df.vintage_year.isin(vint)]

# ---------- UPLOAD HANDLING ----------
uploaded_clean, uploaded_rejected, pdf_extract = None, None, None

if up is not None:
    from ingest import validate_dataframe, CANONICAL

    if up.name.endswith((".csv", ".xlsx")):
        raw = pd.read_csv(up, dtype=object) if up.name.endswith(".csv") \
              else pd.read_excel(up, dtype=object)

        # Best-effort schema mapping: recognize common column-name variants
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
        raw.columns = [COLMAP.get(
            c.strip().lower().replace(" ", "").replace("_", ""), c)
            for c in raw.columns]

        missing = [c for c in CANONICAL if c not in raw.columns]
        if missing:
            st.sidebar.error(f"Could not map columns: {missing}. "
                             f"Found: {list(raw.columns)}")
        else:
            uploaded_clean, uploaded_rejected = validate_dataframe(
                raw[CANONICAL], up.name)
            st.sidebar.success(
                f"✅ {len(uploaded_clean)} rows passed · "
                f"🔴 {len(uploaded_rejected)} rejected")

    elif up.name.endswith(".pdf"):
        import pdfplumber
        with pdfplumber.open(io.BytesIO(up.read())) as pdf:
            text = " ".join((p.extract_text() or "") for p in pdf.pages)
        patterns = {
            "NAV (EUR m)":      r"(?:NAV|net asset value)[^\d]{0,40}([\d.,]+)",
            "Yield (%)":        r"(?:yield)[^\d]{0,40}([\d.,]+)\s*%",
            "Leverage (x)":     r"(?:leverage|net debt)[^\d]{0,40}([\d.,]+)\s*x",
            "Coverage (x)":     r"(?:coverage|ICR)[^\d]{0,40}([\d.,]+)\s*x",
            "Default rate (%)": r"(?:default)[^\d]{0,40}([\d.,]+)\s*%",
            "Covenant":         r"covenant.{0,250}",
        }
        pdf_extract = {}
        for label, pat in patterns.items():
            m = re.search(pat, text, flags=re.IGNORECASE)
            if m:
                pdf_extract[label] = m.group(1) if m.groups() else m.group(0)
        st.sidebar.success(f"✅ PDF parsed — {len(pdf_extract)} fields recognized")

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

    # ---------- UPLOADED FILE RESULTS ----------
    if uploaded_clean is not None and not uploaded_clean.empty:
        st.subheader(f"📤 Uploaded: {up.name} — validated rows")
        st.dataframe(uploaded_clean, use_container_width=True, hide_index=True)
    if pdf_extract:
        st.subheader(f"📤 Extracted from {up.name}")
        st.json(pdf_extract)
        st.caption("⚠️ Pattern-extracted values — always validate against the source document.")

    # ---------- WATCHLIST ----------
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
                     x="strategy", y="nav_eur_m",
                     title=f"NAV by Strategy (as of {latest_q.date()})")
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

    if uploaded_rejected is not None and not uploaded_rejected.empty:
        st.subheader(f"Rejected from upload: {up.name}")
        st.dataframe(uploaded_rejected, use_container_width=True, hide_index=True)

    st.caption("Philosophy: the pipeline is only as good as the trust people can put in its output.")

# ================= TAB 3: ASK THE DOCUMENTS (RAG) =================
with tab3:
    st.subheader("🤖 Ask the Documents")
    st.markdown(
        "Ask questions about the GP quarterly reports. Documents are chunked and "
        "embedded (sentence-transformers → ChromaDB); the most relevant passages "
        "are retrieved and the answer is generated **only from those passages, "
        "with source citations** — open-book, not closed-book."
    )

    @st.cache_resource(show_spinner="Indexing GP reports (first run downloads the embedding model)...")
    def get_index():
        from rag import build_index
        return build_index("raw_reports")

    col = get_index()

    # Wire uploaded PDFs into the RAG index (session-scoped)
    if up is not None and up.name.endswith(".pdf"):
        from rag import add_document
        import pdfplumber as _pp
        up.seek(0)
        with _pp.open(io.BytesIO(up.read())) as _pdf:
            _text = "\n\n".join((p.extract_text() or "") for p in _pdf.pages)
        n_added = add_document(col, up.name, _text)
        if n_added:
            st.success(f"📤 '{up.name}' added to the document index ({n_added} chunks) — ask away.")
        else:
            st.info(f"'{up.name}' is already in this session's index.")

    api_key = st.secrets.get("GROQ_API_KEY", None)
    if not api_key:
        st.warning("No GROQ_API_KEY found — running in extractive mode (passages only).")

    st.markdown("**Try:** *What is Atlantic Mezzanine's leverage covenant?* · "
                "*Which fund had a borrower default this quarter?* · "
                "*What is Alpine's tightest covenant?*")

    q = st.text_input("Your question about the GP reports:")
    if q:
        from rag import answer
        with st.spinner("Retrieving and synthesizing..."):
            ans, sources = answer(col, q, api_key=api_key)
        st.markdown("### Answer")
        st.markdown(ans)
        if sources:
            st.markdown("### Retrieved passages (the evidence)")
            for doc_text, meta in sources:
                with st.expander(f"📄 {meta['source']} — chunk {meta['chunk']}"):
                    st.write(doc_text)
        st.caption("⚠️ AI-generated from retrieved passages — always validate figures "
                   "against the source document before using them in any decision.")