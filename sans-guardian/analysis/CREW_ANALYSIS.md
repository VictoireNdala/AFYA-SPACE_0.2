# Crew analysis module

> **In SANS Guardian:** this module lives in `analysis/`. The app does not need Python at run time: `analysis/export_for_app.py` runs the model on the onboard crew (exported by `npm run export-model` in `server/`) and the NASA OSDR analyses, and writes `server/data/nasa/*.json`, shown on the **NASA data & model** page. The commands below are the module's own standalone workflow; run them from inside `analysis/`. The original Streamlit dashboard was replaced by the React dashboard.

This module analyzes simulated crew data (visual and mental-health indicators) and displays predicted risk of significant SANS-like change, anomalies, alerts and a wellbeing index.

> **Research prototype. Not a medical device. All data is simulated.** Thresholds and the risk model are demo values.

## Quick start

Run these commands from the repository root:

```bash
pip install -r requirements.txt

# 1. Simulate crew data (200 historical missions + 8 astronauts currently in mission)
python -m sans.simulate --n_hist 200 --n_current 8 --seed 42

# 2. Run the analysis (writes results to outputs/)
python -m sans.pipeline --data data/sans_crew_daily.csv --out outputs

# 3. Open the dashboard (it also runs the analysis itself)
streamlit run dashboard/app.py
```

## How it works

| Step | File | What it does |
|---|---|---|
| Data | `sans/simulate.py` | Daily data: OCT retinal thickness, refraction, IOP, blur score, supplement intake, thigh-cuff hours, venous symptoms, sleep, stress |
| Features | `sans/features.py` | Per-astronaut features from the **first 60 days only** (no outcome leakage) |
| Prediction | `sans/pipeline.py` | Compares Logistic Regression, Random Forest, Gradient Boosting (and XGBoost if installed) with 5-fold CV, keeps the best ROC-AUC, scores the current crew |
| Explanation | `sans/pipeline.py` | Linear-model contributions: which factors raise or lower each astronaut's risk |
| Anomalies | `sans/pipeline.py` | Isolation Forest on measurement residuals, shown as red markers on the charts |
| Alerts | `sans/pipeline.py` | Rule-based WATCH / URGENT alerts (retinal thickness, refraction, adherence, venous symptom, stress, sleep, model risk) |
| NASA data | `sans/osdr.py` | Loads NASA OSDR GLDS-700 RT-PCR (human retina): relative expression of apoptosis, inflammation and retinal markers, kit-concordance QC |
| NASA data (TAS) | `sans/tas.py` | OSD-817 / OSD-815 / LSDS-135 / LSDS-132: optic nerve measurements of the ex vivo SANS model by pressure group (18 eyes, 6 groups), group tests, labeling cross-check |
| Dashboard | `dashboard/app.py` | Crew overview, astronaut detail, alerts, model and method, NASA OSDR reference, TAS experiment |

Run `python -m sans.tas` for the TAS experiment tables (saved to `outputs/tas_eye_table.csv` and `outputs/tas_group_tests.csv`). Run `python -m sans.osdr` to print the OSDR expression table (saved to `outputs/osdr_glds700_expression.csv`).

Outputs in `outputs/`: `crew_summary.csv`, `alerts.csv`, `anomalies.csv`, `model_metrics.csv`, `feature_importance.csv`, `crew_contributions.csv`, `run_info.json`.

## Using your own data

Provide a CSV with the columns listed in `sans/config.py` (`DATA_COLUMNS`). `cohort` is `historical` (complete missions with a `sans_significant` 0/1 outcome, at least 30 astronauts) or `current` (missions in progress, outcome empty). Upload it from the dashboard sidebar.

## Important limits

- The high cross-validated AUC measures the pipeline on **simulated data built with the simulation's own assumptions**. It does not show that SANS can be predicted that accurately in real astronauts.
- The outcome definition, alert thresholds and wellbeing index are demo values to be set by medical experts.
- The OSDR GLDS-700 plate 1 holds one control sample with two RT kits: it is a reference profile, not a comparison of conditions, and is not used for training.
- The TAS experiment has 3 donor eyes per group and no significant group difference; the OSDR group labels differ from the paper's figures by one position (see `DATA_SOURCES.md`). Neither is used for training.
- Real validation would need real, ethically approved astronaut data (for example from NASA OSDR / Life Sciences archives).

The original course exercises are kept in `../README_original_exercises.md`.
