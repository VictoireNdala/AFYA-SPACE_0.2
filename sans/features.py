"""Per-astronaut features computed from the early part of a mission (no leakage of the outcome)."""
import numpy as np
import pandas as pd

from sans import config as C

FEATURES = [
    "genetic_variant", "age", "sex_f",
    "baseline_thickness", "baseline_refraction", "baseline_iop",
    "thick_delta_early", "thick_slope_early", "refr_delta_early", "iop_delta_early",
    "adherence_early", "cuff_hours_early", "blur_mean_early", "venous_events_early",
    "sleep_mean_early", "stress_mean_early", "stress_slope_early",
]

FEATURE_LABELS = {
    "genetic_variant": "One-carbon pathway variant",
    "age": "Age",
    "sex_f": "Female",
    "baseline_thickness": "Baseline retinal thickness",
    "baseline_refraction": "Baseline refraction",
    "baseline_iop": "Baseline IOP",
    "thick_delta_early": "Early retinal thickening",
    "thick_slope_early": "Early thickening rate",
    "refr_delta_early": "Early refraction shift",
    "iop_delta_early": "Early IOP change",
    "adherence_early": "Supplement adherence",
    "cuff_hours_early": "Thigh-cuff hours",
    "blur_mean_early": "Blurred-vision reports",
    "venous_events_early": "Venous symptom events",
    "sleep_mean_early": "Sleep duration",
    "stress_mean_early": "Stress level",
    "stress_slope_early": "Stress trend",
}


def _slope(x, y):
    m = ~np.isnan(y)
    if m.sum() < 3:
        return 0.0
    return float(np.polyfit(x[m], y[m], 1)[0])


def astronaut_features(g: pd.DataFrame, window: int = C.EARLY_WINDOW) -> dict:
    g = g.sort_values("day")
    early = g[g.day <= window]
    base = g[g.day <= 6]
    last = early[early.day > window - 12]
    bt, br, bi = (base.retinal_thickness_um.mean(), base.refraction_d.mean(), base.iop_mmhg.mean())
    d = early.day.to_numpy(dtype=float)
    return {
        "genetic_variant": int(g.genetic_variant.iloc[0]),
        "age": int(g.age.iloc[0]),
        "sex_f": int(g.sex_f.iloc[0]),
        "baseline_thickness": bt, "baseline_refraction": br, "baseline_iop": bi,
        "thick_delta_early": last.retinal_thickness_um.mean() - bt,
        "thick_slope_early": _slope(d, early.retinal_thickness_um.to_numpy()),
        "refr_delta_early": last.refraction_d.mean() - br,
        "iop_delta_early": last.iop_mmhg.mean() - bi,
        "adherence_early": early.supplement_taken.mean(),
        "cuff_hours_early": early.cuff_hours.sum(),
        "blur_mean_early": early.blur_score.mean(),
        "venous_events_early": int(early.venous_symptom.sum()),
        "sleep_mean_early": early.sleep_hours.mean(),
        "stress_mean_early": early.stress_score.mean(),
        "stress_slope_early": _slope(d, early.stress_score.to_numpy()) * 30,  # per 30 days
    }


def build_feature_table(df: pd.DataFrame) -> pd.DataFrame:
    rows = []
    for aid, g in df.groupby("astronaut_id", sort=False):
        r = astronaut_features(g)
        r["astronaut_id"] = aid
        r["cohort"] = g.cohort.iloc[0]
        r["sans_significant"] = g.sans_significant.iloc[0]
        r["observed_days"] = int(g.day.max())
        rows.append(r)
    return pd.DataFrame(rows).set_index("astronaut_id")
