"""Simulate crew data: a historical cohort (complete missions, with outcome label)
and a current crew (mission in progress, outcome unknown).

The simulation encodes assumptions inspired by NASA public material (about 20% significant
SANS, genetic/nutritional contribution, plateau after the first weeks). Model performance on
this data therefore reflects the simulation assumptions, NOT real-world accuracy.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from sans import config as C


def _simulate_one(rng, aid, cohort, observed_days, mission_days, force_venous_day=None, stress_trend=0.0):
    g = int(rng.choice([0, 1, 2], p=[0.50, 0.35, 0.15]))
    age = int(rng.integers(32, 58))
    sex_f = int(rng.random() < 0.4)
    adh = float(np.clip(rng.beta(8, 2.2), 0.3, 1.0))
    cuff_group = rng.random() < 0.5

    base_thick = rng.normal(250, 12)
    base_ref = rng.normal(0.0, 0.5)
    base_iop = rng.normal(15, 1.8)

    amp = 14 + 22 * g + rng.normal(0, 11) - 30 * (adh - 0.8) - (7 if cuff_group else 0)
    amp = max(amp, 0.0)
    tau = rng.uniform(30, 50)

    days = np.arange(1, observed_days + 1)
    rise = 1 - np.exp(-days / tau)
    thick_true = base_thick + amp * rise
    ref_true = base_ref + (amp / 55.0) * rise
    iop_true = base_iop + 0.008 * amp * rise

    measured = (days % C.MEASURE_EVERY == 0)
    thick = np.where(measured, thick_true + rng.normal(0, 3.0, len(days)), np.nan)
    ref = np.where(measured, ref_true + rng.normal(0, 0.10, len(days)), np.nan)
    iop = np.where(measured, iop_true + rng.normal(0, 0.9, len(days)), np.nan)

    # sensor/outlier events (for anomaly detection demo)
    for _ in range(int(rng.integers(0, 3))):
        idx = rng.choice(np.where(measured)[0])
        thick[idx] += rng.choice([-1, 1]) * rng.uniform(22, 35)

    blur = np.clip(np.round((ref_true - base_ref) / 0.45 + rng.normal(0, 0.5, len(days))), 0, 3)
    supp = (rng.random(len(days)) < adh).astype(int)
    cuff = np.zeros(len(days))
    if cuff_group:
        cuff[(days % 7 == 0)] = 6.0
    venous = (rng.random(len(days)) < 0.0015).astype(int)
    if force_venous_day is not None and force_venous_day <= observed_days:
        venous[force_venous_day - 1] = 1

    stress = np.clip(3 + 0.3 * np.cumsum(rng.normal(0, 0.15, len(days))) + stress_trend * days / 100
                     + rng.normal(0, 0.8, len(days)), 0, 10)
    sleep = np.clip(6.8 - 0.12 * (stress - 3) + rng.normal(0, 0.6, len(days)), 3, 9)

    df = pd.DataFrame({
        "astronaut_id": aid, "cohort": cohort, "day": days, "mission_days": mission_days,
        "genetic_variant": g, "age": age, "sex_f": sex_f,
        "retinal_thickness_um": thick.round(1), "refraction_d": ref.round(2), "iop_mmhg": iop.round(1),
        "blur_score": blur.astype(int), "supplement_taken": supp, "cuff_hours": cuff,
        "venous_symptom": venous, "sleep_hours": sleep.round(2), "stress_score": stress.round(2),
    })

    label = np.nan
    if cohort == "historical":
        last = df[df.day > mission_days - C.LABEL_WINDOW]
        d_thick = last.retinal_thickness_um.mean() - np.nanmean(df.retinal_thickness_um.iloc[:6])
        d_ref = last.refraction_d.mean() - np.nanmean(df.refraction_d.iloc[:6])
        label = int(d_thick >= C.SIGNIFICANT_THICKNESS_UM or d_ref >= C.SIGNIFICANT_REFRACTION_D)
    df["sans_significant"] = label
    return df


def simulate(n_hist=200, n_current=8, current_day=75, seed=42) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    frames = []
    for i in range(n_hist):
        md = int(rng.integers(160, 200))
        frames.append(_simulate_one(rng, f"H-{i+1:03d}", "historical", md, md))
    for i in range(n_current):
        # one crew member gets a venous symptom event, one a rising stress trend (demo cases)
        frames.append(_simulate_one(
            rng, f"AST-{i+1:03d}", "current", current_day, C.MISSION_DAYS,
            force_venous_day=70 if i == 3 else None,
            stress_trend=6.0 if i == 5 else 0.0))
    return pd.concat(frames, ignore_index=True)[C.DATA_COLUMNS]


def main():
    p = argparse.ArgumentParser(description="Simulate SANS crew data (demo).")
    p.add_argument("--n_hist", type=int, default=200)
    p.add_argument("--n_current", type=int, default=8)
    p.add_argument("--current_day", type=int, default=75)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", type=str, default="data/sans_crew_daily.csv")
    a = p.parse_args()
    df = simulate(a.n_hist, a.n_current, a.current_day, a.seed)
    Path(a.out).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(a.out, index=False)
    h = df[df.cohort == "historical"].groupby("astronaut_id").sans_significant.first()
    print(f"Saved {len(df)} rows to {a.out}")
    print(f"Historical: {len(h)} astronauts, {h.mean():.0%} with significant outcome (target ~20%)")


if __name__ == "__main__":
    main()
