"""Run the analysis module and write JSON files read by the SANS Guardian server (server/data/nasa/).

1. Prediction model: trains on the simulated historical cohort (sans.simulate) and scores OUR onboard crew
   (analysis/data/crew_current.csv, written by `node server/scripts/export-model-input.js`).
2. NASA OSDR, translaminar autonomous system (OSD-817 / OSD-815 / LSDS-135 / LSDS-132): per-eye table, group stats, tests.
3. NASA OSDR GLDS-700: RT-PCR reference expression profile and kit concordance.

Usage (from the repository root):  analysis/.venv/Scripts/python analysis/export_for_app.py
"""
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import pandas as pd  # noqa: E402

from sans import config as C  # noqa: E402
from sans import osdr, tas  # noqa: E402
from sans.features import FEATURE_LABELS  # noqa: E402
from sans.pipeline import run  # noqa: E402
from sans.simulate import simulate  # noqa: E402

OUT = HERE.parent / "server" / "data" / "nasa"


def clean(v):
    """JSON-safe value (NaN -> None, numpy -> python)."""
    if v is None:
        return None
    if hasattr(v, "item"):
        v = v.item()
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


def records(df: pd.DataFrame):
    return [{k: clean(v) for k, v in row.items()} for row in df.to_dict(orient="records")]


def label_history(hist: pd.DataFrame) -> pd.DataFrame:
    """Outcome of each complete mission, with the module's own definition (see sans/simulate.py)."""
    out = []
    for _, g in hist.groupby("astronaut_id", sort=False):
        g = g.sort_values("day").copy()
        md = int(g.mission_days.iloc[0])
        last = g[g.day > md - C.LABEL_WINDOW]
        d_thick = last.retinal_thickness_um.mean() - g.retinal_thickness_um.iloc[:6].mean()
        d_ref = last.refraction_d.mean() - g.refraction_d.iloc[:6].mean()
        g["sans_significant"] = int(d_thick >= C.SIGNIFICANT_THICKNESS_UM or d_ref >= C.SIGNIFICANT_REFRACTION_D)
        out.append(g)
    return pd.concat(out, ignore_index=True)


def model_json():
    crew = pd.read_csv(HERE / "data" / "crew_current.csv")
    history_file = HERE / "data" / "crew_history.csv"
    if history_file.exists():
        # Missions from the onboard simulator: same assumptions as the crew being scored (onset ~30 days).
        hist = label_history(pd.read_csv(history_file))
        training_source = "200 missions from the SANS Guardian onboard simulator"
    else:
        hist = simulate(n_hist=200, n_current=0, seed=42)
        training_source = "200 missions from the analysis module simulator"
    data = pd.concat([hist, crew], ignore_index=True)[C.DATA_COLUMNS]
    path = HERE / "data" / "model_input.csv"
    data.to_csv(path, index=False)
    r = run(str(path), str(HERE / "outputs"))

    summary = r["summary"].reset_index()
    contrib = r["contrib"]
    contributions = {
        aid: sorted(({"feature": f, "label": FEATURE_LABELS[f], "value": round(float(v), 3)} for f, v in contrib.loc[aid].items()),
                    key=lambda x: -abs(x["value"]))
        for aid in contrib.index
    }
    anomalies = r["anomalies"]
    anomalies = anomalies[anomalies.anomaly][["astronaut_id", "day", "retinal_thickness_um", "iop_mmhg", "refraction_d", "anomaly_score", "anomaly_driver"]]
    return {
        "info": {k: clean(v) for k, v in r["info"].items()},
        "scored_up_to_day": int(crew.day.max()),
        "training_source": training_source,
        "early_window_days": C.EARLY_WINDOW,
        "outcome_definition": f"Mean retinal thickening >= {C.SIGNIFICANT_THICKNESS_UM} um or hyperopic shift >= {C.SIGNIFICANT_REFRACTION_D} D over the last {C.LABEL_WINDOW} days of the mission (demo definition)",
        "metrics": records(r["metrics"].round(4)),
        "importance": records(r["importance"].round(4)),
        "crew": records(summary),
        "contributions": contributions,
        "anomalies": records(anomalies.round(3)),
        "alerts": records(r["alerts"]),
    }


def tas_json():
    t = tas.tas_eye_table()
    summaries = {}
    for m, label in tas.MEASURES.items():
        g = tas.group_summary(t, m)
        summaries[m] = {"label": label, "groups": records(g.round(3))}
    eyes = t[["eye_id", "donor", "sex", "age", "group", *tas.MEASURES.keys()]]
    return {
        "studies": ["OSD-817", "OSD-815", "LSDS-135", "LSDS-132"],
        "reference": "Peng M. et al., npj Microgravity 8, 44 (2022), doi:10.1038/s41526-022-00232-5",
        "groups": {str(k): v for k, v in tas.GROUPS.items()},
        "measures": tas.MEASURES,
        "eyes": records(eyes),
        "summaries": summaries,
        "tests": records(tas.group_tests(t)),
        "consistency_issues": tas.check_consistency(t),
        "paper_label_check": records(tas.paper_label_check(t)),
        "osd815_samples": int(len(tas.osd815_design())),
    }


def glds_json():
    e = osdr.expression_table()
    c = osdr.kit_concordance(e)
    return {
        "study": "GLDS-700",
        "sample": "42991 OD NEG CON (single control eye, two RT kits)",
        "reference_gene": osdr.REFERENCE_ASSAY,
        "low_confidence_cq": osdr.LOW_CONFIDENCE_CQ,
        "expression": records(e.round(4)),
        "concordance": {"n_targets": c["n_targets"], "pearson_r": c["pearson_r"], "mean_abs_diff_dcq": c["mean_abs_diff_dcq"]},
    }


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    (HERE / "outputs").mkdir(exist_ok=True)
    for name, fn in [("tas", tas_json), ("glds700", glds_json), ("model", model_json)]:
        data = fn()
        (OUT / f"{name}.json").write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"wrote server/data/nasa/{name}.json")
