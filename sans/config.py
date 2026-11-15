"""Central configuration. ALL thresholds are DEMO values, not clinical recommendations."""

MISSION_DAYS = 180          # nominal mission length
EARLY_WINDOW = 60           # days of data used to predict the end-of-mission outcome
LABEL_WINDOW = 30           # last N days of a mission used to define the outcome
MEASURE_EVERY = 3           # OCT / refraction / IOP measured every N days

# Outcome definition (demo): "clinically significant SANS-like change" at end of mission
SIGNIFICANT_THICKNESS_UM = 40.0     # mean thickness increase vs baseline over the last LABEL_WINDOW days
SIGNIFICANT_REFRACTION_D = 0.75     # hyperopic shift in diopters

# Rule-based alerts (demo thresholds)
ALERT_RULES = {
    "thickness_watch_um": 25.0,
    "thickness_urgent_um": 40.0,
    "refraction_watch_d": 0.50,
    "refraction_urgent_d": 0.75,
    "adherence_watch": 0.70,        # supplement adherence over last 14 days
    "stress_watch": 6.0,            # mean stress score (0-10) over last 7 days
    "sleep_watch_h": 5.5,           # mean sleep hours over last 7 days
    "venous_window_days": 14,
    "model_risk_watch": 0.50,
}

# Risk levels from predicted probability
RISK_LOW_MAX = 0.25
RISK_MODERATE_MAX = 0.50

DATA_COLUMNS = [
    "astronaut_id", "cohort", "day", "mission_days",
    "genetic_variant", "age", "sex_f",
    "retinal_thickness_um", "refraction_d", "iop_mmhg",
    "blur_score", "supplement_taken", "cuff_hours", "venous_symptom",
    "sleep_hours", "stress_score", "sans_significant",
]

DISCLAIMER = ("Research prototype. Not a medical device. All data is simulated. "
              "Thresholds and the risk model are demo values and are not clinically validated.")
