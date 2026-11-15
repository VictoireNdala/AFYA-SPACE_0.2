"""AFYA-SPACE crew dashboard (Streamlit).  Run:  streamlit run dashboard/app.py"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

from sans import config as C
from sans.features import FEATURE_LABELS
from sans import tas
from sans.osdr import DEFAULT_FILE as OSDR_FILE, expression_table, kit_concordance
from sans.pipeline import run
from sans.simulate import simulate

st.set_page_config(page_title="AFYA-SPACE Crew Dashboard", page_icon="🛰️", layout="wide")

DATA_PATH = ROOT / "data" / "sans_crew_daily.csv"
OUT_DIR = ROOT / "outputs"
LEVEL_COLOR = {"Low": "#2e9e5b", "Moderate": "#e0a800", "High": "#d33a3a",
               "NONE": "#2e9e5b", "INFO": "#3b82c4", "WATCH": "#e0a800", "URGENT": "#d33a3a"}


@st.cache_data(show_spinner="Running crew analysis...")
def analyse(path: str, mtime: float):
    return run(path, str(OUT_DIR))


def ensure_data():
    if not DATA_PATH.exists():
        DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
        simulate().to_csv(DATA_PATH, index=False)


# ----------------------------------------------------------------- sidebar
st.sidebar.title("AFYA-SPACE")
st.sidebar.caption("Mental & visual health monitoring for astronaut crews")
source = st.sidebar.radio("Data source", ["Simulated crew (demo)", "Upload CSV"])
data_path = DATA_PATH
if source == "Upload CSV":
    up = st.sidebar.file_uploader("Daily crew CSV (same schema as the demo file)", type="csv")
    if up is None:
        st.info("Upload a CSV with the demo schema, or switch back to the simulated crew.")
        st.stop()
    data_path = ROOT / "data" / "uploaded_crew.csv"
    data_path.write_bytes(up.getvalue())
else:
    ensure_data()
    if st.sidebar.button("Regenerate simulated data"):
        seed = int(np.random.default_rng().integers(1, 10_000))
        simulate(seed=seed).to_csv(DATA_PATH, index=False)
        st.cache_data.clear()
        st.sidebar.success(f"New simulation (seed {seed}).")

try:
    res = analyse(str(data_path), data_path.stat().st_mtime)
except Exception as e:  # noqa: BLE001
    st.error(f"Analysis failed: {e}")
    st.stop()

summary, alerts, metrics, importance = res["summary"], res["alerts"], res["metrics"], res["importance"]
anoms, info = res["anomalies"], res["info"]
raw = pd.read_csv(data_path)

st.warning(C.DISCLAIMER, icon="⚠️")
st.title("Crew health analysis")

tab_over, tab_ast, tab_alerts, tab_model, tab_osdr, tab_tas = st.tabs(
    ["Crew overview", "Astronaut detail", "Alerts", "Model & method", "NASA OSDR reference", "TAS experiment (OSD-817)"])

# ----------------------------------------------------------------- overview
with tab_over:
    n_high = int((summary.risk_level == "High").sum())
    n_urg = int((summary.alert_level == "URGENT").sum())
    best = metrics.iloc[0]
    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Crew size", len(summary))
    c2.metric("Mission day", int(summary.mission_day.max()))
    c3.metric("High predicted risk", n_high)
    c4.metric("Astronauts with URGENT alert", n_urg)
    c5.metric("Model ROC-AUC (CV)", f"{best.roc_auc:.2f}", help="Cross-validated on SIMULATED data; reflects simulation assumptions.")

    if n_urg or n_high:
        names = ", ".join(summary.index[(summary.alert_level == "URGENT") | (summary.risk_level == "High")])
        st.error(f"Priority review suggested for: {names}")
    else:
        st.success("No priority alert for the current crew.")

    left, right = st.columns([3, 2])
    with left:
        st.subheader("Predicted risk of significant SANS-like change at end of mission")
        s = summary.sort_values("risk_probability")
        fig = go.Figure(go.Bar(
            x=s.risk_probability, y=s.index, orientation="h",
            marker_color=[LEVEL_COLOR[l] for l in s.risk_level],
            text=[f"{p:.0%} ({l})" for p, l in zip(s.risk_probability, s.risk_level)], textposition="auto"))
        fig.update_layout(xaxis=dict(range=[0, 1], tickformat=".0%"), height=380, margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(fig, width="stretch")
    with right:
        st.subheader("Visual vs. mental wellbeing")
        fig2 = go.Figure(go.Scatter(
            x=summary.thickness_delta_um, y=summary.wellbeing_index, mode="markers+text", text=summary.index,
            textposition="top center",
            marker=dict(size=16, color=[LEVEL_COLOR[l] for l in summary.alert_level], line=dict(width=1, color="white"))))
        fig2.update_layout(xaxis_title="Retinal thickening vs. baseline (µm)", yaxis_title="Wellbeing index (0-100, demo)",
                           height=380, margin=dict(l=10, r=10, t=10, b=10))
        st.plotly_chart(fig2, width="stretch")

    st.subheader("Crew table")
    show = summary[["mission_day", "risk_probability", "risk_level", "alert_level", "n_alerts",
                    "thickness_delta_um", "refraction_delta_d", "iop_mmhg", "adherence_14d",
                    "stress_7d", "sleep_7d", "wellbeing_index", "anomalous_days", "top_factors"]].copy()
    show["risk_probability"] = show.risk_probability.map("{:.0%}".format)
    show["adherence_14d"] = show.adherence_14d.map("{:.0%}".format)

    def _color(v):
        return f"color: {LEVEL_COLOR[v]}; font-weight: 700" if v in LEVEL_COLOR else ""
    st.dataframe(show.style.map(_color, subset=["risk_level", "alert_level"]), width="stretch")
    st.download_button("Download crew summary (CSV)", summary.to_csv().encode(), "crew_summary.csv", "text/csv")

# ----------------------------------------------------------------- astronaut detail
with tab_ast:
    aid = st.selectbox("Astronaut", list(summary.index))
    s = summary.loc[aid]
    g = raw[raw.astronaut_id == aid].sort_values("day")
    a = anoms[anoms.astronaut_id == aid]
    m = g.dropna(subset=["retinal_thickness_um"])
    base_t = g[g.day <= 6].retinal_thickness_um.mean()
    base_r = g[g.day <= 6].refraction_d.mean()

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Predicted risk", f"{s.risk_probability:.0%}", s.risk_level, delta_color="off")
    c2.metric("Thickening vs. baseline", f"{s.thickness_delta_um:+.1f} µm")
    c3.metric("Refraction shift", f"{s.refraction_delta_d:+.2f} D")
    c4.metric("Wellbeing index", f"{s.wellbeing_index:.0f}/100")

    st.caption(f"Main factors behind the estimate: {s.top_factors or 'no dominant factor'}")

    fig = go.Figure()
    fig.add_trace(go.Scatter(x=m.day, y=m.retinal_thickness_um, mode="lines+markers", name="Retinal thickness (µm)",
                             line=dict(color="#3b82c4")))
    red = a[a.anomaly].dropna(subset=["retinal_thickness_um"])
    fig.add_trace(go.Scatter(x=red.day, y=red.retinal_thickness_um, mode="markers", name="Anomaly (Isolation Forest)",
                             marker=dict(color="red", size=14, symbol="x")))
    fig.add_hline(y=base_t, line_dash="dash", line_color="gray", annotation_text="baseline")
    fig.add_hline(y=base_t + C.ALERT_RULES["thickness_watch_um"], line_dash="dot", line_color="#e0a800",
                  annotation_text="watch (demo)")
    fig.add_hline(y=base_t + C.ALERT_RULES["thickness_urgent_um"], line_dash="dot", line_color="#d33a3a",
                  annotation_text="urgent (demo)")
    fig.update_layout(title="Retinal thickness (OCT) with anomalies in red", xaxis_title="Mission day",
                      yaxis_title="µm", height=380, margin=dict(t=50, b=10))
    st.plotly_chart(fig, width="stretch")

    l, r = st.columns(2)
    with l:
        mr = g.dropna(subset=["refraction_d"])
        f2 = go.Figure(go.Scatter(x=mr.day, y=mr.refraction_d, mode="lines+markers", line=dict(color="#7c5cc4")))
        f2.add_hline(y=base_r + C.ALERT_RULES["refraction_watch_d"], line_dash="dot", line_color="#e0a800")
        f2.add_hline(y=base_r + C.ALERT_RULES["refraction_urgent_d"], line_dash="dot", line_color="#d33a3a")
        f2.update_layout(title="Refraction (diopters)", height=300, margin=dict(t=40, b=10), xaxis_title="Mission day")
        st.plotly_chart(f2, width="stretch")
    with r:
        g7 = g.set_index("day")
        f3 = go.Figure()
        f3.add_trace(go.Scatter(x=g7.index, y=g7.stress_score.rolling(7, min_periods=1).mean(), name="Stress (0-10)",
                                line=dict(color="#d33a3a")))
        f3.add_trace(go.Scatter(x=g7.index, y=g7.sleep_hours.rolling(7, min_periods=1).mean(), name="Sleep (h)",
                                line=dict(color="#2e9e5b")))
        f3.update_layout(title="Mental wellbeing: stress and sleep (7-day mean)", height=300, margin=dict(t=40, b=10),
                         xaxis_title="Mission day")
        st.plotly_chart(f3, width="stretch")

    contrib = res["contrib"].loc[aid].sort_values()
    contrib = contrib[contrib.abs() > 0.05]
    fc = go.Figure(go.Bar(x=contrib.values, y=[FEATURE_LABELS[i] for i in contrib.index], orientation="h",
                          marker_color=["#2e9e5b" if v < 0 else "#d33a3a" for v in contrib.values]))
    fc.update_layout(title="What drives this astronaut's risk (linear model; red raises, green lowers)",
                     height=max(260, 24 * len(contrib) + 100), margin=dict(t=40, b=10))
    st.plotly_chart(fc, width="stretch")

    mine = alerts[alerts.astronaut_id == aid]
    st.subheader("Alerts for this astronaut")
    if len(mine):
        st.dataframe(mine, width="stretch")
    else:
        st.success("No alert.")

# ----------------------------------------------------------------- alerts
with tab_alerts:
    levels = st.multiselect("Levels", ["URGENT", "WATCH"], default=["URGENT", "WATCH"])
    f = alerts[alerts.level.isin(levels)]
    st.metric("Open alerts", len(f))
    st.dataframe(f, width="stretch")
    st.caption("Alerts are generated by configurable rules (see sans/config.py). Values are demo thresholds.")
    st.download_button("Download alerts (CSV)", alerts.to_csv(index=False).encode(), "alerts.csv", "text/csv")

# ----------------------------------------------------------------- model
with tab_model:
    st.subheader("How the analysis works")
    st.markdown(
        f"""
1. **Training set:** {info['n_train']} simulated historical missions, of which {info['n_train_positive']}
   ({info['prevalence']:.0%}) ended with a significant SANS-like change (defined from the last {C.LABEL_WINDOW} days:
   retinal thickening ≥ {C.SIGNIFICANT_THICKNESS_UM:.0f} µm or refraction shift ≥ {C.SIGNIFICANT_REFRACTION_D} D).
2. **Features:** computed only from the **first {C.EARLY_WINDOW} days** (baseline, early trends, supplement adherence,
   thigh-cuff hours, symptoms, sleep, stress, genetic variant), so the model predicts the end-of-mission outcome.
3. **Models compared** with 5-fold cross-validation; the best ROC-AUC is used (**{info['best_model']}**).
4. **Anomaly detection:** an Isolation Forest trained on historical measurement residuals flags unusual measurements
   of the current crew (red markers).
5. **Alerts:** transparent rules with demo thresholds. **Wellbeing index:** demo score from stress and sleep.
"""
    )
    st.warning("Cross-validated performance is measured on simulated data generated with the assumptions listed above. "
               "It shows that the pipeline works, not that SANS can be predicted this accurately in real astronauts.")
    st.dataframe(metrics.round(3), width="stretch")
    fi = importance.sort_values("abs_coef").tail(12)
    fim = go.Figure(go.Bar(x=fi.coef, y=fi.label, orientation="h",
                           marker_color=["#d33a3a" if v > 0 else "#2e9e5b" for v in fi.coef]))
    fim.update_layout(title="Linear model coefficients (standardized features)", height=420, margin=dict(t=40, b=10))
    st.plotly_chart(fim, width="stretch")


# ----------------------------------------------------------------- NASA OSDR
with tab_osdr:
    st.subheader("NASA OSDR GLDS-700: human retina gene expression (RT-PCR, apoptosis / inflammation panel)")
    st.caption("Source: NASA Open Science Data Repository, dataset GLDS-700 (ex vivo translaminar pressure model of SANS; "
               "Peng et al., npj Microgravity 2022, doi:10.1038/s41526-022-00232-5).")
    if not OSDR_FILE.exists():
        st.info("Place the GLDS-700 'RET APOP INFLAMM PLATE 1_Results.xlsx' file in data/osdr/GLDS-700/ to enable this tab.")
    else:
        expr = expression_table()
        conc = kit_concordance(expr)
        st.warning("Plate 1 contains a single control sample (42991 OD NEG CON) measured with two reverse-transcription kits. "
                   "It gives a reference expression profile and a technical check. It has no pressure groups, so it cannot show "
                   "SANS-related changes and is NOT used to train the crew risk model.", icon="ℹ️")
        c1, c2, c3 = st.columns(3)
        c1.metric("Targets measured", expr.Target.nunique())
        c2.metric("Kit agreement (r, dCq)", f"{conc['pearson_r']:.2f}", help="iScript vs. VILO on non-reference targets")
        c3.metric("Low-confidence targets", int((expr.flag != "OK").groupby(expr.Target).any().sum()))

        cats = [c for c in sorted(expr.category.unique()) if c != "Reference"]
        pick = st.multiselect("Marker categories", cats, default=["Apoptosis", "Inflammation / glia"])
        view = expr[expr.category.isin(pick)]
        fig = go.Figure()
        for kit, color in [("VILO", "#3b82c4"), ("iSCRIPT", "#7c5cc4")]:
            v = view[view.kit == kit]
            fig.add_trace(go.Bar(x=v.gene, y=v.rel_expression, name=kit, marker_color=color))
        fig.update_layout(barmode="group", yaxis_type="log", yaxis_title="Relative expression (2^-dCq vs. GAPDH)",
                          height=380, margin=dict(t=20, b=10))
        st.plotly_chart(fig, width="stretch")

        piv = conc["table"].reset_index()
        fs = go.Figure(go.Scatter(x=piv["iSCRIPT"], y=piv["VILO"], mode="markers+text", text=piv.Target.str.split("-").str[0],
                                  textposition="top center", marker=dict(size=9, color="#2e9e5b")))
        lim = [piv[["iSCRIPT", "VILO"]].min().min() - 1, piv[["iSCRIPT", "VILO"]].max().max() + 1]
        fs.add_trace(go.Scatter(x=lim, y=lim, mode="lines", line=dict(dash="dash", color="gray"), showlegend=False))
        fs.update_layout(title="Technical concordance between the two RT kits (dCq)", xaxis_title="iScript dCq",
                         yaxis_title="VILO dCq", height=420, margin=dict(t=50, b=10))
        st.plotly_chart(fs, width="stretch")

        st.dataframe(view[["kit", "gene", "category", "cq_mean", "delta_cq", "rel_expression", "n_wells", "flag"]].round(3),
                     width="stretch")
        st.download_button("Download expression table (CSV)", expr.to_csv(index=False).encode(),
                           "osdr_glds700_expression.csv", "text/csv")


# ----------------------------------------------------------------- TAS experiment
with tab_tas:
    st.subheader("Ex vivo SANS model (TAS): optic nerve measurements by pressure group")
    st.caption("NASA OSDR OSD-817 / OSD-815 with LSDS-135 (IHC, CTB, TUNEL) and LSDS-132 (Western blot). "
               "Peng et al., npj Microgravity 2022, doi:10.1038/s41526-022-00232-5.")
    try:
        eyes = tas.tas_eye_table()
    except Exception as e:  # noqa: BLE001
        st.info(f"Place the OSD-815 / OSD-817 / LSDS-135 / LSDS-132 files in data/osdr/ to enable this tab ({e}).")
        eyes = None
    if eyes is not None:
        tests = tas.group_tests(eyes)
        st.warning("18 human donor eyes in 6 pressure groups (3 eyes per group). With so few eyes the comparison is "
                   f"descriptive: {int(tests.significant_p05.sum())} of {len(tests)} measures differ significantly between "
                   "groups (Kruskal-Wallis, p < 0.05). This is an experimental model, not astronaut data, and it is not used "
                   "to train the crew risk model.", icon="ℹ️")
        issues = tas.check_consistency(eyes)
        if issues:
            st.error("Data consistency issues: " + "; ".join(issues))

        design = pd.DataFrame([{"Group": k, "ICP:IOP (mmHg)": f"{v['icp']}:{v['iop']}" + (" (IOP 21 for 7 d, then 16)" if k == 3 else ""),
                                "Translaminar gradient IOP-ICP (mmHg)": v["iop"] - v["icp"], "Optic nerve tilt (°)": v["tilt"],
                                "Eyes": int((eyes.group == k).sum())} for k, v in tas.GROUPS.items()])
        st.dataframe(design, width="stretch", hide_index=True)

        m = st.selectbox("Measure", list(tas.MEASURES), format_func=lambda k: tas.MEASURES[k])
        gs = tas.group_summary(eyes, m)
        fig = go.Figure()
        fig.add_trace(go.Bar(x=gs.group.astype(str), y=gs["mean"], error_y=dict(type="data", array=gs["sem"].fillna(0)),
                             name="Group mean ± SEM", marker_color="#3b82c4", opacity=0.7))
        fig.add_trace(go.Scatter(x=eyes.group.astype(str), y=eyes[m], mode="markers", name="Individual eyes",
                                 text=eyes.eye_id, marker=dict(color="#d33a3a", size=9)))
        fig.update_layout(xaxis_title="Group (OSDR labeling)", yaxis_title=tas.MEASURES[m], height=380, margin=dict(t=20, b=10))
        st.plotly_chart(fig, width="stretch")
        row = tests[tests.measure == m]
        if len(row):
            st.caption(f"Kruskal-Wallis across groups: H = {row.kruskal_H.iloc[0]}, p = {row.p_value.iloc[0]} (N = 3 per group).")

        means = eyes.groupby("group")[list(tas.MEASURES)].mean()
        z = (means - means.mean()) / means.std().replace(0, np.nan)
        hm = go.Figure(go.Heatmap(z=z.T.values, x=[f"G{g}" for g in z.index], y=[tas.MEASURES[c] for c in z.columns],
                                  colorscale="RdBu_r", zmid=0, colorbar=dict(title="z-score")))
        hm.update_layout(title="Group means of every measure (z-score across groups)", height=460, margin=dict(t=50, b=10))
        st.plotly_chart(hm, width="stretch")

        st.dataframe(tests, width="stretch", hide_index=True)

        with st.expander("Group labeling check against the paper's figures"):
            chk = tas.paper_label_check(eyes)
            st.dataframe(chk, width="stretch", hide_index=True)
            st.markdown("Group means of CTB and TUNEL counts in the OSDR files match the bar heights of the paper's Fig. 9g and "
                        "Fig. 8d (read by eye, so approximate) when **paper group k is compared with OSDR group k-1**, and not "
                        "when the numbers are compared as they are. This suggests a group-labeling difference between the "
                        "figures and the OSDR files. Clarify it with the data owners before drawing per-group conclusions. "
                        "This tab uses the OSDR labeling, which is consistent with the OSD-817 sample metadata.")

        with st.expander("OSD-815 ocular globe photography (design metadata only)"):
            d815 = tas.osd815_design()
            st.write(f"{d815.donor.nunique()} donors, {len(d815)} photographed samples "
                     f"({(d815.timepoint == 'Pre-Treatment').sum()} pre, {(d815.timepoint == 'Post-Treatment').sum()} post). "
                     "The diameter and depth measurements are in a separate archive that was not provided, so only the design is used.")
            st.dataframe(d815, width="stretch", hide_index=True)
        st.download_button("Download per-eye table (CSV)", eyes.to_csv(index=False).encode(), "tas_eye_table.csv", "text/csv")
