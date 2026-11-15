"""Crew analysis pipeline: train on historical missions, score the current crew,
detect anomalies, raise alerts, and write results used by the dashboard."""
import argparse
import json
import warnings
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, IsolationForest, RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (accuracy_score, brier_score_loss, f1_score, precision_score,
                             recall_score, roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

from sans import config as C
from sans.features import FEATURE_LABELS, FEATURES, build_feature_table

warnings.filterwarnings("ignore")
LEVEL_ORDER = {"NONE": 0, "INFO": 1, "WATCH": 2, "URGENT": 3}


def _candidates():
    models = {
        "Logistic Regression": make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=0.5)),
        "Random Forest": RandomForestClassifier(n_estimators=300, min_samples_leaf=3, random_state=42),
        "Gradient Boosting": GradientBoostingClassifier(random_state=42),
    }
    try:  # optional, already in the project requirements
        from xgboost import XGBClassifier
        models["XGBoost"] = XGBClassifier(n_estimators=200, max_depth=3, learning_rate=0.05,
                                          eval_metric="logloss", random_state=42, verbosity=0)
    except Exception:
        pass
    return models


def risk_level(p: float) -> str:
    return "Low" if p < C.RISK_LOW_MAX else ("Moderate" if p < C.RISK_MODERATE_MAX else "High")


# ------------------------------------------------------------------ prediction
def train_and_score(feat: pd.DataFrame):
    hist = feat[feat.cohort == "historical"]
    cur = feat[feat.cohort == "current"]
    X, y = hist[FEATURES].to_numpy(float), hist.sans_significant.astype(int).to_numpy()
    cv = StratifiedKFold(5, shuffle=True, random_state=42)

    metrics, oof = [], {}
    for name, model in _candidates().items():
        prob = cross_val_predict(model, X, y, cv=cv, method="predict_proba")[:, 1]
        pred = (prob >= 0.5).astype(int)
        oof[name] = prob
        metrics.append({
            "model": name, "roc_auc": roc_auc_score(y, prob), "accuracy": accuracy_score(y, pred),
            "precision": precision_score(y, pred, zero_division=0),
            "recall": recall_score(y, pred, zero_division=0),
            "f1": f1_score(y, pred, zero_division=0), "brier": brier_score_loss(y, prob),
        })
    metrics = pd.DataFrame(metrics).sort_values("roc_auc", ascending=False).reset_index(drop=True)
    best = metrics.loc[0, "model"]

    final = _candidates()[best].fit(X, y)
    cur_prob = final.predict_proba(cur[FEATURES].to_numpy(float))[:, 1]

    # explainable view: linear model contributions (coefficient x standardized value)
    lin = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, C=0.5)).fit(X, y)
    scaler, lr = lin.named_steps["standardscaler"], lin.named_steps["logisticregression"]
    contrib = scaler.transform(cur[FEATURES].to_numpy(float)) * lr.coef_[0]
    contrib = pd.DataFrame(contrib, index=cur.index, columns=FEATURES)

    importance = pd.DataFrame({"feature": FEATURES,
                               "label": [FEATURE_LABELS[f] for f in FEATURES],
                               "coef": lr.coef_[0], "abs_coef": np.abs(lr.coef_[0])}
                              ).sort_values("abs_coef", ascending=False)
    info = {"best_model": best, "n_train": int(len(hist)), "n_train_positive": int(y.sum()),
            "prevalence": float(y.mean())}
    return cur_prob, contrib, metrics, importance, info


def top_factors(row: pd.Series, k=3) -> str:
    s = row.sort_values(key=np.abs, ascending=False).head(k)
    return "; ".join(f"{FEATURE_LABELS[f]} ({'raises' if v > 0 else 'lowers'} risk)" for f, v in s.items() if abs(v) > 0.15)


# ------------------------------------------------------------------ anomalies
def _daily_matrix(df: pd.DataFrame) -> pd.DataFrame:
    """Residual of each measurement vs. the rolling median of the 5 nearest measurements."""
    out = []
    for aid, g in df.groupby("astronaut_id", sort=False):
        g = g.sort_values("day").copy()
        m = g.retinal_thickness_um.notna()
        for src, dst in [("retinal_thickness_um", "thick_res"), ("iop_mmhg", "iop_res"), ("refraction_d", "ref_res")]:
            meas = g.loc[m, src]
            g[dst] = np.nan
            g.loc[m, dst] = meas - meas.rolling(5, center=True, min_periods=3).median()
        out.append(g)
    return pd.concat(out)


ANOM_COLS = ["thick_res", "iop_res", "ref_res"]


def detect_anomalies(df: pd.DataFrame):
    full = _daily_matrix(df)
    hist = full[(full.cohort == "historical")].dropna(subset=ANOM_COLS)
    iso = IsolationForest(n_estimators=200, contamination=0.01, random_state=42).fit(hist[ANOM_COLS])
    cur = full[full.cohort == "current"].copy()
    cur["anomaly"] = False
    m = cur[ANOM_COLS].notna().all(axis=1)
    cur.loc[m, "anomaly_score"] = -iso.score_samples(cur.loc[m, ANOM_COLS])
    cur.loc[m, "anomaly"] = iso.predict(cur.loc[m, ANOM_COLS]) == -1
    # point out which variable deviates the most (in historical std units)
    sd = hist[ANOM_COLS].std()
    dev = (cur[ANOM_COLS].abs() / sd).fillna(-1)
    names = {"thick_res": "retinal thickness", "iop_res": "IOP", "ref_res": "refraction"}
    cur["anomaly_driver"] = np.where(m, dev.idxmax(axis=1).map(names), "")
    return cur


# ------------------------------------------------------------------ alerts & summary
def _last(g, col, n):
    return g[g.day > g.day.max() - n][col]


def build_alerts(df: pd.DataFrame, summary: pd.DataFrame) -> pd.DataFrame:
    R, rows = C.ALERT_RULES, []

    def add(aid, level, rule, value, thr, msg):
        rows.append({"astronaut_id": aid, "level": level, "rule": rule,
                     "value": round(float(value), 2), "threshold": thr, "message": msg})

    for aid, g in df[df.cohort == "current"].groupby("astronaut_id", sort=False):
        s = summary.loc[aid]
        if _last(g, "venous_symptom", R["venous_window_days"]).sum() > 0:
            add(aid, "URGENT", "venous_symptom", 1, 0,
                "Venous symptom reported in the last 14 days. Flight surgeon review needed.")
        td = s["thickness_delta_um"]
        if td >= R["thickness_urgent_um"]:
            add(aid, "URGENT", "retinal_thickness", td, R["thickness_urgent_um"], "Retinal thickening above urgent threshold.")
        elif td >= R["thickness_watch_um"]:
            add(aid, "WATCH", "retinal_thickness", td, R["thickness_watch_um"], "Retinal thickening above watch threshold.")
        rd = s["refraction_delta_d"]
        if rd >= R["refraction_urgent_d"]:
            add(aid, "URGENT", "refraction_shift", rd, R["refraction_urgent_d"], "Hyperopic shift above urgent threshold.")
        elif rd >= R["refraction_watch_d"]:
            add(aid, "WATCH", "refraction_shift", rd, R["refraction_watch_d"], "Hyperopic shift above watch threshold.")
        if s["adherence_14d"] < R["adherence_watch"]:
            add(aid, "WATCH", "supplement_adherence", s["adherence_14d"], R["adherence_watch"],
                "Low adherence to the supplement protocol (last 14 days).")
        if s["stress_7d"] >= R["stress_watch"]:
            add(aid, "WATCH", "stress", s["stress_7d"], R["stress_watch"], "High stress score (last 7 days).")
        if s["sleep_7d"] < R["sleep_watch_h"]:
            add(aid, "WATCH", "sleep", s["sleep_7d"], R["sleep_watch_h"], "Short sleep duration (last 7 days).")
        if s["risk_probability"] >= R["model_risk_watch"]:
            add(aid, "WATCH", "model_risk", s["risk_probability"], R["model_risk_watch"],
                "Prediction model estimates a high probability of significant SANS-like change.")
    cols = ["astronaut_id", "level", "rule", "value", "threshold", "message"]
    a = pd.DataFrame(rows, columns=cols)
    if not a.empty:
        a["_o"] = a.level.map(LEVEL_ORDER)
        a = a.sort_values(["_o", "astronaut_id"], ascending=[False, True]).drop(columns="_o")
    return a.reset_index(drop=True)


def wellbeing(stress7, sleep7):
    """Demo index 0-100 combining stress (0-10) and sleep (hours)."""
    s = np.clip(1 - stress7 / 10, 0, 1)
    z = np.clip((sleep7 - 4) / 3.5, 0, 1)
    return round(float(100 * (0.55 * s + 0.45 * z)), 0)


def run(data_path: str, out_dir: str = "outputs") -> dict:
    df = pd.read_csv(data_path)
    missing = [c for c in C.DATA_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing columns: {missing}")
    feat = build_feature_table(df)
    if (feat.cohort == "historical").sum() < 30:
        raise ValueError("Need at least 30 historical astronauts with outcomes to train the model.")

    cur_prob, contrib, metrics, importance, info = train_and_score(feat)
    cur_ids = feat[feat.cohort == "current"].index

    rows = []
    for aid, p in zip(cur_ids, cur_prob):
        g = df[df.astronaut_id == aid].sort_values("day")
        b = g[g.day <= 6]
        recent = g.dropna(subset=["retinal_thickness_um"]).tail(3)
        st7, sl7 = _last(g, "stress_score", 7).mean(), _last(g, "sleep_hours", 7).mean()
        rows.append({
            "astronaut_id": aid, "mission_day": int(g.day.max()), "mission_days": int(g.mission_days.iloc[0]),
            "risk_probability": round(float(p), 3), "risk_level": risk_level(p),
            "thickness_delta_um": round(float(recent.retinal_thickness_um.mean() - b.retinal_thickness_um.mean()), 1),
            "refraction_delta_d": round(float(g.dropna(subset=["refraction_d"]).tail(3).refraction_d.mean()
                                              - b.refraction_d.mean()), 2),
            "iop_mmhg": round(float(g.dropna(subset=["iop_mmhg"]).tail(3).iop_mmhg.mean()), 1),
            "adherence_14d": round(float(_last(g, "supplement_taken", 14).mean()), 2),
            "stress_7d": round(float(st7), 1), "sleep_7d": round(float(sl7), 1),
            "wellbeing_index": wellbeing(st7, sl7),
            "top_factors": top_factors(contrib.loc[aid]),
        })
    summary = pd.DataFrame(rows).set_index("astronaut_id")

    anomalies = detect_anomalies(df)
    alerts = build_alerts(df, summary)
    n_anom = anomalies[anomalies.anomaly].groupby("astronaut_id").size()
    summary["anomalous_days"] = n_anom.reindex(summary.index).fillna(0).astype(int)
    lv = alerts.groupby("astronaut_id")["level"].agg(lambda s: max(s, key=LEVEL_ORDER.get)) if not alerts.empty else pd.Series(dtype=str)
    summary["alert_level"] = lv.reindex(summary.index).fillna("NONE")
    summary["n_alerts"] = alerts.groupby("astronaut_id").size().reindex(summary.index).fillna(0).astype(int) if not alerts.empty else 0

    info.update({"generated_from": str(data_path), "n_current": int(len(summary)),
                 "disclaimer": C.DISCLAIMER})
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    summary.to_csv(out / "crew_summary.csv")
    alerts.to_csv(out / "alerts.csv", index=False)
    metrics.to_csv(out / "model_metrics.csv", index=False)
    importance.to_csv(out / "feature_importance.csv", index=False)
    contrib.to_csv(out / "crew_contributions.csv")
    anomalies[["astronaut_id", "day", "retinal_thickness_um", "iop_mmhg", "refraction_d",
               "anomaly", "anomaly_score", "anomaly_driver"]].to_csv(out / "anomalies.csv", index=False)
    (out / "run_info.json").write_text(json.dumps(info, indent=2))
    return {"summary": summary, "alerts": alerts, "metrics": metrics, "importance": importance,
            "contrib": contrib, "anomalies": anomalies, "info": info}


def main():
    p = argparse.ArgumentParser(description="Run the crew analysis pipeline.")
    p.add_argument("--data", default="data/sans_crew_daily.csv")
    p.add_argument("--out", default="outputs")
    a = p.parse_args()
    r = run(a.data, a.out)
    print(r["metrics"].round(3).to_string(index=False))
    print(f"\nBest model: {r['info']['best_model']}")
    print(r["summary"][["mission_day", "risk_probability", "risk_level", "alert_level", "anomalous_days", "wellbeing_index"]])
    print(f"\n{len(r['alerts'])} alerts written to {a.out}/")


if __name__ == "__main__":
    main()
