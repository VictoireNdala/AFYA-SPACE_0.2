# Data sources, scientific basis and use of AI

## NASA pages used

| Source | What we use from it | Where in the app |
|---|---|---|
| NASA HRP, *Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)*: https://www.nasa.gov/reference/risk-of-spaceflight-associated-neuro-ocular-syndrome-sans/ | Definition, ~70% prevalence on long ISS missions, nutritional and mechanical research avenues | Risk factors, countermeasures, copy |
| NASA, *What Is Spaceflight Associated Neuro-ocular Syndrome?*: https://www.nasa.gov/image-article/what-spaceflight-associated-neuro-ocular-syndrome/ | Mechanism (headward fluid shift) and frequency | Context, daily vision log |
| NASA, *Thigh Cuff*: https://www.nasa.gov/reference/thigh-cuff/ | Study design: 2 sessions of 6 hours, leg and neck vein ultrasound | Thigh-cuff session target duration and history |
| NASA HHP, *Cardiovascular and Vision Laboratory*: https://www.nasa.gov/directorates/esdmd/hhp/cardiovascular-and-vision/ | ~2 L fluid shift, measurement tools (OCT, IOP, ultrasound), orthostatic intolerance, slow venous flow and one clot, LBNP | Venous safety checklist, exam types, return-to-Earth plan text, LBNP sessions |
| NASA, *Houston We Have a Podcast*, ep. 351 "Let's B-Complex": https://www.nasa.gov/podcasts/houston-we-have-a-podcast/lets-b-complex/ | One-carbon pathway and genetics, 4 B vitamins, one pill a day from ~6 months before flight to 30 days after, ~20% clinically significant, first changes ~30 days, refraction up to ~1.5 D, spare glasses, recovery 90 days to 6 months | Supplement schedule, risk factors, simulation shape, glasses, recovery checkpoints |

## Values that are facts vs demo values

Only the facts listed above come from NASA. **Everything else is a demo value**, stored in `server/config/protocol.json` and labelled as such in the interface: alert thresholds (retina, refraction, IOP, adherence), risk weights and levels, cuff and LBNP pressures, LBNP duration, radio window timing and bandwidth, live-vitals thresholds. The simulation parameters in `server/src/simulation.js` (maximum retinal change, growth and recovery time constants) are also demo values chosen to illustrate the NASA facts. The bone-density view is an uncalibrated illustration.

## NASA open data used (NASA Open Science Data Repository, OSDR)

Raw files are in `analysis/data/osdr/`; the analysis code is in `analysis/sans/` (team's prediction-model branch); results shown on the **NASA data & model** page are written to `server/data/nasa/*.json` by `analysis/export_for_app.py`.

**Translaminar autonomous system (TAS), the ex vivo human eye model of SANS:** OSD-817 (ISA design: 9 donors, 18 eyes, 6 pressure groups), OSD-815 (globe photography, design metadata only), LSDS-135 (immunohistochemistry scores, CTB retrograde-transport counts, TUNEL counts), LSDS-132 (Western blot of fibronectin and collagen IV in the ICP / IOP chamber medium). Reference: Peng M. et al., *The ex vivo human translaminar autonomous system to study spaceflight associated neuro-ocular syndrome pathogenesis*, npj Microgravity 8, 44 (2022), https://doi.org/10.1038/s41526-022-00232-5.
- Used for: one table per eye with its pressure group; mean ± SEM and individual eyes for 12 measures; Kruskal-Wallis across groups; cross-check of group labels.
- Findings: with 3 eyes per group no measure differs significantly between groups (p < 0.05). The CTB and TUNEL group means match the paper's figures only when paper group k is compared with OSDR group k−1, which points to a labelling difference to clarify with the data owners. Source-file quirks are handled in code (a "7346_0D" typo, "_FN" sample suffixes, extra Western-blot donors, `#REF!` columns).

**GLDS-700 (RT-PCR, human donor retina, apoptosis / inflammation / retinal-marker panel, plate 1):**
- Used for: relative expression (2^−ΔCq vs GAPDH) of 26 targets grouped by biology, QC flags (no amplification, Cq > 35), agreement between the two reverse-transcription kits.
- Limit: plate 1 holds one control eye only, so it is a reference profile, not a comparison of conditions.

Neither dataset is astronaut data and neither is used to train the crew prediction model.

## Prediction model (simulated data)

`analysis/sans/` (simulate, features, pipeline) trains Logistic Regression, Random Forest and Gradient Boosting on 200 simulated historical missions (5-fold cross-validation, best ROC-AUC kept), then scores **the onboard crew of this app**, exported by `server/scripts/export-model-input.js` (features from the first 60 flight days only; genetic data used only with consent, otherwise the most common category is imputed). It also flags anomalous measurements (Isolation Forest) and computes a demo wellbeing index. The high AUC reflects the simulation's own assumptions, not real-world accuracy.

## Radio link model

The channel model (delay = distance ÷ speed of light + processing ± jitter, packet loss, bit-flip noise, CRC32-protected frames, periodic outages) comes from the team's MQTT simulation in `tools/radio-mqtt/` and is reproduced in the onboard server (`server/src/sync/radio.js`) with ISS, Moon and Mars distance profiles.

## Other references

- Analogue and isolation studies relevant to the wellbeing check-in (from the initial brief): ESA Mars-500, HI-SEAS, SIRIUS.
- Questionnaires mentioned in the brief (PHQ-9, GAD-7, PANAS, NASA-TLX, PSQI) are **not** implemented; the check-in uses a simple mood and stress scale.

## Use of AI

This project was developed with the assistance of **Claude (Anthropic)** for research synthesis, the specification, the code (server, dashboard, tests) and this documentation. The team reviewed the scientific statements against the NASA sources listed above.
