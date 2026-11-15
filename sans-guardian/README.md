# SANS Guardian: SANS & crew health monitor

Offline-first monitoring prototype that supports **prevention, early detection and management of Spaceflight Associated Neuro-ocular Syndrome (SANS)** during long-duration missions, plus daily crew wellbeing.

Built for the **NASA Space Apps Challenge 2026, Lubumbashi (DRC)**.

> **Research prototype. Not a medical device. All data is simulated.**
> SANS has no established treatment and its exact cause is unknown. SANS Guardian does not diagnose, prescribe or choose doses. Protocols and alert thresholds are configurable by the medical team; every default in this repository is a demo value.

---

## Why this matters

- Weightlessness shifts about 2 liters of fluid toward the upper body (NASA Cardiovascular and Vision Laboratory).
- About 70% of ISS astronauts on ~6-month missions show SANS findings; about 20% develop clinically significant SANS.
- Findings include optic disc swelling, choroidal folds, thicker retina (OCT), globe flattening and refraction changes of up to about 1.5 diopters. **SANS can occur without symptoms the astronaut notices**, so objective measurements matter.
- First changes appear around 30 days of flight. Swelling often improves between 90 days and 6 months after return, but some changes persist.
- NASA is studying countermeasures: a B-vitamin supplement (folate, B6, B12, riboflavin), veno-constrictive thigh cuffs and lower body negative pressure (LBNP). Their effectiveness is still under investigation.
- Moon and Mars missions mean delayed, intermittent contact with Earth, so monitoring must work offline.

## What SANS Guardian does

| Role | Feature |
|---|---|
| **Prevention** | Explainable follow-up priority score (F1/F8), B-vitamin schedule and adherence calendar (F2), thigh-cuff and LBNP sessions with a mandatory safety checklist (F3/F4), exam calendar (F5) |
| **Detection** | Daily vision log (F6), ocular trends vs pre-flight baseline with thresholds (F7), venous-signal monitoring (F9), live wearable vitals |
| **Management** | Graded alerts INFO / WATCH / URGENT with rule, value and threshold (F10), spare-glasses suggestion (F11), post-flight recovery R+30 / R+90 / R+6 months (F12), individual and crew end-of-mission reports, printable to PDF (F13) |
| **Operations** | Local-first SQLite storage, prioritised and compressed sync over a simulated radio link with packet loss and retries, ground station with idempotent storage (F14), closed-vocabulary voice assistant in English and French, with crew queries (status, alerts, vitals, eye measurements) and spoken announcement of urgent alerts from a floating microphone on every page (F15), deterministic simulated mission (F16) |
| **Wellbeing** | Daily mood and stress check-in, exercise checklist, illustrative bone-density what-if view |
| **Science** | Real NASA OSDR data on the ex vivo eye model of SANS (OSD-817, OSD-815, LSDS-135, LSDS-132, GLDS-700) and a prediction model (4 algorithms compared, explained factors, anomaly detection) that scores the onboard crew |

### The dashboard

- **Mission clock**: scrub or *play* the mission from 6 months before launch to 6 months after landing. Every view follows it, so the jury can watch drift appear, alerts fire and recovery happen.
- **Flourish-style charts**: one astronaut highlighted against the rest of the crew in grey, direct end labels, threshold bands, annotations, a ranked-bar "race" that re-sorts as time moves, a calendar heatmap, and a Chart / Table toggle so every value is readable without hovering. The palette was checked for colour-vision deficiency against the dark surface.
- **Editorial design**: white pages, Bodoni Moda for headings, Instrument Sans for text, colour reserved for data and alert levels.
- Bundled fonts and inlined icons: nothing is loaded from the internet. An optional cover photo can be placed at `client/public/images/cover.jpg` (use a licensed or public-domain image, for example from NASA).

## Architecture

```
Astronaut (voice / touch) -> React dashboard -> Onboard server (Express + WebSocket) -> SQLite (onboard.db)
                                                         |
                                     Priority queue (JSON + zlib, critical first)
                                                         |
                                Simulated radio window (bytes/s budget, packet loss, backoff)
                                                         |
                                       Ground station (ground.db, idempotent acks)
```

Details and diagrams: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tech stack

Node.js 22.13+ (built-in `node:sqlite`, `node:zlib`, `node:crypto`, `node:test`), Express, ws, React 18, Vite, Recharts. No native dependency to compile.

## Quick start

Two terminals:

```bash
cd server
npm install
npm run simulate        # 6 simulated astronauts, 180-day mission, seed 42
npm start               # onboard server on http://localhost:3001
```

```bash
cd client
npm install
npm run dev             # dashboard on http://localhost:5173
```

Single-process offline mode (what you would run on board): `npm run build` in `client`, then `npm start` in `server`, and open http://localhost:3001.

## Analysis module (NASA data and prediction model)

The results are already in `server/data/nasa/`, so the app works without Python. To recompute them (Python 3.11+):

```bash
python -m venv analysis/.venv
```

```bash
analysis/.venv/Scripts/python -m pip install numpy pandas scikit-learn scipy openpyxl
```

```bash
node server/scripts/export-model-input.js
```

```bash
analysis/.venv/Scripts/python analysis/export_for_app.py
```

The first command exports the onboard crew in the format the model expects; the second trains the model on simulated historical missions, scores the crew and re-reads the NASA OSDR files. Restart the server afterwards. Methods and limits: [`analysis/CREW_ANALYSIS.md`](analysis/CREW_ANALYSIS.md) and [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## 3-minute demo script

1. **Overview**: crew cards, follow-up priority, the permanent research-prototype banner. Press **Play** on the mission clock and watch the ranked bars re-sort as retinal thickness drifts.
2. **High-priority astronaut (AST-003)**: open the explained score (genetics with consent, mission duration, adherence, trend) and the retinal-thickness curve crossing the WATCH and URGENT thresholds. Point out AST-005: clear drift, **no symptoms** in the daily log.
3. **Alert**: the graded URGENT alert shows its rule, value and threshold. Acknowledge it as the flight surgeon.
4. **Thigh-cuff session**: start a session, tick "Swelling of an arm or leg", press *Report signal now* and show the immediate URGENT alert.
5. **Link & sync**: watch the queue drain during a radio window, critical alerts first, with packet loss and retries.
6. **Voice**: say or type "Log supplement taken" and see adherence update. Switch to FR and ask "État de l'équipage" or "Épaisseur rétinienne du pilote". Ask "Should I take more vitamins?" to show it refuses medical advice.
7. **Report**: open the end-of-mission report and print it to PDF. Move the clock to R+180 to show recovery and the persistent-change flag.
8. **NASA data & model**: show the real NASA OSDR eye-model data (pressure groups, honest statistics) and the prediction model's explained risk for the crew. On **Link & sync**, switch the distance to the Moon or Mars and watch latency grow.

## Configuration

Edit [`server/config/protocol.json`](server/config/protocol.json): supplement schedule, session durations and settings, safety-signal list, alert thresholds, risk weights, exam calendar, spare-glasses inventory, radio window and bandwidth. All defaults are **demo values**, not clinical recommendations.

Environment variables (optional): `PORT`, `SG_TOKEN` (static bearer token for write requests), `SG_DATA_KEY` (64 hex chars, AES-256-GCM key for genetic data; a demo key is derived otherwise). In the client, `SG_API` sets the server the dev proxy talks to.

## Radio link (MQTT)

The onboard server simulates the link itself (priority queue, windows, loss, noise with CRC32, distance delay for the ISS, the Moon or Mars). A standalone MQTT version written by the team is in `tools/radio-mqtt/` (see its README).

## Tests

```bash
cd server
npm test
```

Covers: deterministic simulation, risk score bounds and explained factors, consent handling, adherence and its alert, threshold crossing, venous signal = URGENT, queue priority / idempotence / retry after loss, closed radio window, voice parser in English and French (including named astronauts and refusal of medical questions), encryption at rest.

## Data sources and references

- NASA Human Research Program: Risk of Spaceflight Associated Neuro-ocular Syndrome (SANS)
- NASA: What Is Spaceflight Associated Neuro-ocular Syndrome? (infographic)
- NASA: Thigh Cuff (veno-constrictive thigh cuffs study)
- NASA Human Health and Performance: Cardiovascular and Vision Laboratory
- NASA, *Houston We Have a Podcast*, episode 351, "Let's B-Complex"

Exactly how each source is used, and what is still missing, is listed in [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md). Full background report (French): [`docs/Rapport_SANS.pdf`](docs/Rapport_SANS.pdf).

## Limitations

- Simulated data only; the score and thresholds are not clinically validated.
- B vitamins, thigh cuffs and LBNP are NASA research avenues, not proven treatments.
- Thigh cuffs act on venous circulation and NASA has observed slow venous flow and a blood clot in crew members: any use requires medical supervision.
- The browser speech engine may need a network; the onboard target is Faster-Whisper + Piper (not included).
- The onboard server simulates the radio channel in-process; the MQTT version (`tools/radio-mqtt/`) runs separately and uses a public test broker by default, so only simulated data should be sent.
- Authentication is a static token, suitable for a prototype only.

## Use of AI

This project was developed with the assistance of Claude (Anthropic) for research synthesis, specification, code and documentation. See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## License and team

Choose a license before publishing (for example MIT) and add a `LICENSE` file.

Team AFYA SPACE, NASA Space Apps Challenge Lubumbashi 2026. The prediction model and NASA OSDR analysis (`analysis/`), the MQTT radio simulation (`tools/radio-mqtt/`) and the bilingual voice assistant features (language, voice and speed choice, spoken alerts, crew queries) come from the team's branches and were integrated into the app. Add team names here.
