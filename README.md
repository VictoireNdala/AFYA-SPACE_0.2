# SANS Guardian
Offline-first monitoring prototype to support prevention, early detection and management of Spaceflight Associated Neuro-ocular Syndrome (SANS) during long-duration space missions.

Built for the NASA Space Apps Challenge 2026 - Lubumbashi, DRC.

Research prototype. Not a medical device. All data is simulated. SANS has no established treatment and its exact cause is unknown. SANS Guardian does not diagnose, prescribe or choose doses. Protocols and alert thresholds are configurable by the medical team; defaults in this repository are demo values.

**Démo en ligne :** https://victoirendala.github.io/AFYA-SPACE_0.2/ (la simulation tourne dans le navigateur, sans serveur).

## Crew analysis module

This repository also includes a crew-analysis prototype for simulated SANS-related data. It predicts risk, flags anomalies, generates alerts and displays a wellbeing index. See [docs/CREW_ANALYSIS.md](docs/CREW_ANALYSIS.md) for its setup, methods and limitations.

Why this matters
Weightlessness shifts about 2 liters of fluid toward the upper body (NASA Cardiovascular and Vision Laboratory).
About 70% of ISS astronauts on ~6-month missions show SANS findings, and about 20% develop clinically significant SANS.
Findings include optic disc swelling, choroidal folds, retinal thickening, globe flattening and refraction changes of up to about 1.5 diopters. SANS can occur without symptoms the astronaut notices, so objective measurements matter.
NASA is studying countermeasures: a B-vitamin supplement (folate, B6, B12, riboflavin), veno-constrictive thigh cuffs and lower body negative pressure (LBNP). Their effectiveness is still under investigation.
Missions to the Moon and Mars mean limited and delayed contact with Earth, so monitoring has to work offline.
What SANS Guardian does
Role	Feature
Prevention	Pre-flight risk profile (explainable score), B-vitamin schedule and adherence tracking, thigh-cuff and LBNP session tracking with safety questionnaire, exam calendar
Detection	Daily vision log, trends of retinal thickness / refraction / intraocular pressure vs. baseline, venous-symptom monitoring
Management	Graded alerts to flight surgeons, spare-glasses management, post-flight recovery tracking (30 days, 90 days, 6 months), end-of-mission PDF report
Operations	Offline storage, prioritized low-bandwidth sync over a simulated radio link (MQTT), local voice assistant, realistic simulated data
Architecture
Astronaut (voice / UI) -> Local API (FastAPI) -> SQLite (local)
                                   |
                         Priority sync queue (zlib)
                                   |
              Simulated radio window  -- MQTT -->  Ground station (ground.db)
                                   |
                          Streamlit dashboard (flight surgeons)
Details: docs/ARCHITECTURE.md.

Tech stack
Python 3.11+, FastAPI, SQLAlchemy, SQLite, Streamlit, Plotly, paho-mqtt (Mosquitto), Faster-Whisper and Piper (optional offline voice), pytest, ruff.

Quick start
git clone <your-repo-url> sans-guardian
cd sans-guardian
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# 1. Generate simulated crew data (180-day mission, fixed seed)
python -m sans_guardian.simulation.generate --n 8 --seed 42

# 2. Start the local API
uvicorn sans_guardian.api.main:app --reload

# 3. Start the dashboard (new terminal)
streamlit run dashboard/app.py

# 4. Optional: ground station + MQTT broker
docker compose up -d mosquitto
python -m sans_guardian.sync.ground
Without Docker, the app falls back to a SQLite queue and the built-in radio simulator.

Optional voice: install the extra models for Faster-Whisper and Piper (see docs/ARCHITECTURE.md). Without them, the Voice console accepts typed commands.

3-minute demo script
Overview: show the crew list, risk levels and the permanent research-prototype banner.
High-risk astronaut: open the explained risk score and the retinal-thickness drift vs. baseline.
Alert: show the graded alert (rule, value, threshold) raised by the drift.
Thigh-cuff session: run a session; tick a venous symptom in the safety questionnaire and show the immediate URGENT alert.
Link & Sync: watch the priority queue empty during a radio window (critical alerts first).
Voice: say or type "log supplement taken" and see the adherence update.
Report: generate the end-of-mission PDF.
Configuration
Edit config/protocol.yaml to change the supplement schedule offsets, session durations, alert thresholds, risk weights and radio-window settings. All defaults are demo values, not clinical recommendations.

Tests
pytest
ruff check .
Data sources and references
NASA Human Research Program: Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)
NASA: What Is Spaceflight Associated Neuro-ocular Syndrome? (infographic)
NASA: Thigh Cuff study (Mitigating Headward Fluid Shifts with Veno-constrictive Thigh Cuffs during Spaceflight)
NASA Human Health and Performance: Cardiovascular and Vision Laboratory
NASA, Houston We Have a Podcast, episode 351, "Let's B-Complex"
NASA Open Science Data Repository (OSDR) and Life Sciences data, used to inspire the structure of the simulated data (see docs/DATA_SOURCES.md for exactly what is used)
Full report (French): docs/Rapport_SANS.pdf.

Limitations
Simulated data only; the risk score and thresholds are not clinically validated.
B vitamins, thigh cuffs and LBNP are NASA research avenues, not proven treatments.
Thigh cuffs act on venous circulation, and NASA has observed slow venous flow and a blood clot in crew members; any use requires medical supervision.
Authentication is a static token, suitable for a prototype only.
Use of AI
This project was developed with the assistance of Claude (Anthropic) for research synthesis, specification and code generation. See docs/DATA_SOURCES.md.

License
Choose a license before publishing (for example MIT) and add a LICENSE file.

Team
NASA Space Apps Challenge Lubumbashi 2026 team: AFYA SPACE.
