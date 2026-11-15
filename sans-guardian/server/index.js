// SANS Guardian onboard server: local API + live stream + simulated radio link to the ground station.
import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WebSocketServer } from 'ws';

import { protocol, ROOT, LANDING_DAY, FIRST_DAY, LAST_DAY, dayLabel } from './src/config.js';
import { openDb, seed, loadMission, getMeta, setMeta } from './src/db.js';
import { usingDemoKey } from './src/crypto.js';
import { evaluateAlerts } from './src/services/alerts.js';
import { adherence } from './src/services/adherence.js';
import { missionInfo, crewSummary, astronautDetail, reminders, buildReport, crewReport } from './src/services/views.js';
import { MEASURE_TYPES } from './src/services/trends.js';
import { enqueue, PRIORITY, recentItems } from './src/sync/queue.js';
import { GroundStation } from './src/sync/ground.js';
import { RadioLink } from './src/sync/radio.js';
import { parseCommand, COMMAND_EXAMPLES, COMMAND_EXAMPLES_FR } from './src/voice/parser.js';
import { makeReplies } from './src/voice/replies.js';
import { createVitalsSimulator, SCENARIOS } from './src/vitals/simulator.js';
import { evaluateVitals } from './src/vitals/rules.js';

// ---------- Storage, link and simulators ----------
const db = openDb();
if (!db.prepare('SELECT COUNT(*) AS n FROM astronauts').get().n) seed(db, { n: 6, seed: 42 });
const ground = new GroundStation();
const radio = new RadioLink({ db, transport: { send: (item, now) => ground.receive(item, now) }, config: protocol.radio });
radio.setProfile(protocol.radio.profile ?? 'ISS');

// Precomputed results of the analysis module (analysis/export_for_app.py): NASA OSDR datasets and the prediction model.
const NASA_DIR = join(ROOT, 'data', 'nasa');
const loadNasa = (name) => {
  try {
    return JSON.parse(readFileSync(join(NASA_DIR, `${name}.json`), 'utf8'));
  } catch {
    return null;
  }
};
const nasa = { tas: loadNasa('tas'), glds700: loadNasa('glds700'), model: loadNasa('model') };
let codes = db.prepare('SELECT code FROM astronauts ORDER BY code').all().map((r) => r.code);
let vitalsSim = createVitalsSimulator(codes);

let rev = 1;
let cache = null;
const currentDay = () => getMeta(db, 'currentDay', protocol.mission.defaultDay);
const activeSessions = () => db.prepare("SELECT * FROM sessions WHERE status = 'active'").all().map((s) => ({ ...s, signals: JSON.parse(s.signals || '[]') }));

/** Mission data + evaluated alerts for the current day, cached until the next change. */
function ctx() {
  if (cache && cache.rev === rev) return cache;
  const m = loadMission(db, currentDay());
  cache = { rev, m, alerts: evaluateAlerts(m) };
  return cache;
}

// ---------- Live stream ----------
const app = express();
app.use(cors());
app.use(express.json({ limit: '200kb' }));
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });
const broadcast = (msg) => {
  const data = JSON.stringify(msg);
  wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
};

/** Call after every write: refresh caches, queue new alerts for the ground (critical first), notify clients. */
function changed() {
  rev += 1;
  const { alerts } = ctx();
  const seen = new Set(db.prepare('SELECT alert_id FROM alerts_seen').all().map((r) => r.alert_id));
  for (const a of alerts) {
    if (seen.has(a.id)) continue;
    db.prepare('INSERT OR IGNORE INTO alerts_seen VALUES (?)').run(a.id);
    enqueue(db, { id: `alert:${a.id}`, priority: a.level === 'INFO' ? PRIORITY.LOG : PRIORITY.CRITICAL, kind: 'alert', summary: `${a.level} · ${a.code} · ${a.title}`, data: a });
    if (!a.acked && a.level !== 'INFO') broadcast({ type: 'alert', alert: a });
  }
  broadcast({ type: 'rev', rev });
}

function primeQueue() {
  const { m, alerts } = ctx();
  for (const a of alerts) db.prepare('INSERT OR IGNORE INTO alerts_seen VALUES (?)').run(a.id);
  if (db.prepare('SELECT COUNT(*) AS n FROM sync_items').get().n) return;
  // Backlog waiting for the next pass: open alerts, recent measurements, recent logs.
  for (const a of alerts.filter((x) => !x.acked && x.level !== 'INFO')) {
    enqueue(db, { id: `alert:${a.id}`, priority: PRIORITY.CRITICAL, kind: 'alert', summary: `${a.level} · ${a.code} · ${a.title}`, data: a });
  }
  for (const x of m.measurements.filter((r) => r.day > m.day - 10)) {
    enqueue(db, { id: `meas:${x.id}`, priority: PRIORITY.MEASUREMENT, kind: 'measurement', summary: `${x.code} · ${MEASURE_TYPES[x.type]?.label ?? x.type}`, data: x });
  }
  for (const s of m.symptoms.filter((r) => r.day > m.day - 3)) {
    enqueue(db, { id: `log:${s.id}`, priority: PRIORITY.LOG, kind: 'symptom_log', summary: `${s.code} · Vision log ${dayLabel(s.day)}`, data: s });
  }
}
primeQueue();

// Live vitals alerts (in memory) + radio tick, once per second.
const liveAlerts = [];
const lastLevels = new Map();
let digestTimer = 0;
let lastVitals = [];

setInterval(() => {
  const now = Date.now();
  const crew = vitalsSim.tick().map((a) => {
    const status = evaluateVitals(a);
    for (const c of status.checks) {
      const key = `${a.code}:${c.metric}`;
      const prev = lastLevels.get(key) ?? 0;
      if (c.level === prev) continue;
      lastLevels.set(key, c.level);
      if (c.level > prev) {
        const alert = { id: `LIVE:${key}:${now}`, ts: now, code: a.code, level: c.level === 2 ? 'URGENT' : 'WATCH', rule: `VITALS_${c.metric.toUpperCase()}`, title: c.label, message: `${c.label}: ${c.message} (demo threshold).`, source: 'live', acked: false, resolved: false };
        liveAlerts.unshift(alert);
        if (liveAlerts.length > 200) liveAlerts.pop();
        enqueue(db, { id: alert.id, priority: PRIORITY.CRITICAL, kind: 'live_alert', summary: `${alert.level} · ${a.code} · ${c.label}`, data: alert }, now);
        broadcast({ type: 'alert', alert });
      } else if (c.level === 0) {
        for (const al of liveAlerts) if (al.code === a.code && al.rule === `VITALS_${c.metric.toUpperCase()}`) al.resolved = true;
      }
    }
    return { ...a, status: { level: status.level, alerts: status.checks.filter((c) => c.level > 0) } };
  });
  lastVitals = crew;

  digestTimer += 1;
  if (digestTimer >= protocol.radio.digestEverySeconds) {
    digestTimer = 0;
    enqueue(db, { id: `digest:${now}`, priority: PRIORITY.LOG, kind: 'vitals_digest', summary: `Vitals digest · ${crew.length} crew`, data: crew.map((c) => ({ code: c.code, ...c.vitals })) }, now);
  }

  const tick = radio.tick(now, 1);
  const q = radio.status(now).queue;
  broadcast({ type: 'tick', ts: now, crew, link: { ...tick.window, queued: q.queued, critical: q.byPriority[0].count, sentBytes: tick.bytes, events: tick.events } });
}, 1000);

wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'hello', rev })));

// ---------- Optional static token (prototype-level auth) ----------
app.use((req, res, next) => {
  const token = process.env.SG_TOKEN;
  if (!token || req.method === 'GET') return next();
  if (req.headers.authorization === `Bearer ${token}`) return next();
  return res.status(401).json({ error: 'Missing or invalid token' });
});

const need = (cond, res, status, error) => {
  if (cond) return false;
  res.status(status).json({ error });
  return true;
};
const findAstronaut = (code) => ctx().m.astronauts.find((a) => a.code === code);

// ---------- API ----------
const api = express.Router();

api.get('/health', (_req, res) => res.json({ ok: true, rev }));

api.get('/state', (_req, res) => {
  res.json({
    rev,
    mission: missionInfo(currentDay()),
    crew: codes,
    seed: getMeta(db, 'seed'),
    usingDemoKey,
    protocol: {
      notice: protocol._notice,
      thresholds: protocol.thresholds,
      supplement: protocol.supplement,
      countermeasures: protocol.countermeasures,
      safetySignals: protocol.safetySignals,
      exams: protocol.exams,
      radio: protocol.radio,
      risk: protocol.risk,
      returnProtocol: protocol.returnProtocol,
    },
    scenarios: Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, v.label])),
    voiceExamples: COMMAND_EXAMPLES,
    voiceExamplesFr: COMMAND_EXAMPLES_FR,
  });
});

api.post('/mission/day', (req, res) => {
  const day = Math.round(Number(req.body?.day));
  if (need(Number.isFinite(day), res, 400, 'day must be a number')) return;
  setMeta(db, 'currentDay', Math.min(LAST_DAY, Math.max(FIRST_DAY, day)));
  changed();
  res.json(missionInfo(currentDay()));
});

api.get('/crew', (_req, res) => {
  const { m, alerts } = ctx();
  res.json({ mission: missionInfo(m.day), crew: crewSummary(m, alerts, activeSessions()) });
});

api.get('/astronauts/:code', (req, res) => {
  const { m, alerts } = ctx();
  const d = astronautDetail(m, req.params.code, alerts, activeSessions());
  if (need(d, res, 404, 'Unknown astronaut')) return;
  const mm = nasa.model;
  const model = mm ? { ...(mm.crew.find((c) => c.astronaut_id === req.params.code) ?? {}), contributions: mm.contributions?.[req.params.code] ?? [], bestModel: mm.info?.best_model, scoredUpToDay: mm.scored_up_to_day } : null;
  res.json({ mission: missionInfo(m.day), ...d, model, reminders: reminders(m, req.params.code, activeSessions()) });
});

api.get('/astronauts/:code/risk', (req, res) => {
  const { m, alerts } = ctx();
  const d = astronautDetail(m, req.params.code, alerts);
  if (need(d, res, 404, 'Unknown astronaut')) return;
  res.json(d.risk);
});

api.get('/alerts', (_req, res) => {
  const { m, alerts } = ctx();
  res.json({ mission: missionInfo(m.day), alerts, live: liveAlerts.slice(0, 60) });
});

api.post('/alerts/:id/ack', (req, res) => {
  const id = req.params.id;
  const by = String(req.body?.by || 'Flight surgeon').slice(0, 60);
  const live = liveAlerts.find((a) => a.id === id);
  if (live) {
    live.acked = true;
    live.ackedBy = by;
  } else {
    db.prepare('INSERT OR REPLACE INTO acks VALUES (?, ?, ?)').run(id, by, Date.now());
  }
  changed();
  res.json({ ok: true });
});

const level03 = (v) => Math.max(0, Math.min(3, Math.round(Number(v) || 0)));

api.post('/logs/vision', (req, res) => {
  const b = req.body ?? {};
  if (need(findAstronaut(b.code), res, 404, 'Unknown astronaut')) return;
  const day = currentDay();
  const now = Date.now();
  const r = db
    .prepare('INSERT INTO symptoms (code, day, blurry, near, far, change, venous, notes, source, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(b.code, day, level03(b.blurry), level03(b.near), level03(b.far), level03(b.change), b.venous ? 1 : 0, String(b.notes || '').slice(0, 280), 'onboard', now);
  enqueue(db, { id: `log:${r.lastInsertRowid}`, priority: PRIORITY.LOG, kind: 'symptom_log', summary: `${b.code} · Vision log ${dayLabel(day)}`, data: { ...b, day } });
  changed();
  res.json({ ok: true, message: 'Saved locally. It will be sent with the next radio pass.' });
});

function logSupplement(code, taken = true) {
  const day = currentDay();
  const time = new Date().toTimeString().slice(0, 5);
  db.prepare('INSERT INTO supplements VALUES (?, ?, ?, ?, ?) ON CONFLICT(code, day) DO UPDATE SET taken = excluded.taken, time = excluded.time').run(code, day, taken ? 1 : 0, taken ? time : null, 'onboard');
  enqueue(db, { id: `supp:${code}:${day}:${Date.now()}`, priority: PRIORITY.LOG, kind: 'supplement_log', summary: `${code} · Supplement ${dayLabel(day)}`, data: { code, day, taken, time } });
  changed();
  return adherence(ctx().m.supplements, code, day, 7);
}

api.post('/logs/supplement', (req, res) => {
  const { code, taken = true } = req.body ?? {};
  if (need(findAstronaut(code), res, 404, 'Unknown astronaut')) return;
  res.json({ ok: true, adherence7: logSupplement(code, !!taken) });
});

api.post('/logs/wellbeing', (req, res) => {
  const { code, mood, stress } = req.body ?? {};
  if (need(findAstronaut(code), res, 404, 'Unknown astronaut')) return;
  const day = currentDay();
  const prev = db.prepare('SELECT sleep FROM wellbeing WHERE code = ? AND day = ?').get(code, day);
  db.prepare('INSERT INTO wellbeing VALUES (?, ?, ?, ?, ?) ON CONFLICT(code, day) DO UPDATE SET mood = excluded.mood, stress = excluded.stress').run(code, day, Number(mood) || 3, Number(stress) || 0, prev?.sleep ?? 7);
  enqueue(db, { id: `wb:${code}:${day}:${Date.now()}`, priority: PRIORITY.LOG, kind: 'wellbeing', summary: `${code} · Check-in ${dayLabel(day)}`, data: { code, day, mood, stress } });
  changed();
  res.json({ ok: true });
});

api.post('/measurements', (req, res) => {
  const { code, type, value } = req.body ?? {};
  if (need(findAstronaut(code), res, 404, 'Unknown astronaut')) return;
  if (need(MEASURE_TYPES[type] && Number.isFinite(Number(value)), res, 400, 'Invalid measurement')) return;
  const day = currentDay();
  const r = db.prepare('INSERT INTO measurements (code, day, type, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)').run(code, day, type, Number(value), MEASURE_TYPES[type].unit, 'onboard');
  enqueue(db, { id: `meas:${r.lastInsertRowid}`, priority: PRIORITY.MEASUREMENT, kind: 'measurement', summary: `${code} · ${MEASURE_TYPES[type].label}`, data: { code, day, type, value: Number(value) } });
  changed();
  res.json({ ok: true });
});

function startSession(code, type, parameter) {
  if (!protocol.countermeasures[type]) return { error: 'Unknown session type', status: 400 };
  if (activeSessions().some((s) => s.code === code)) return { error: `${code} already has a session in progress`, status: 409 };
  const now = Date.now();
  const id = `S-${code}-${type}-${now}`;
  const p = Number.isFinite(Number(parameter)) ? Number(parameter) : protocol.countermeasures[type].defaultParameter;
  db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, ?, 0, 0, ?, NULL, ?, ?, ?)').run(id, code, type, currentDay(), now, p, '[]', '', 'active');
  enqueue(db, { id: `session-start:${id}`, priority: PRIORITY.LOG, kind: 'session', summary: `${code} · ${type} started`, data: { id, code, type, parameter: p, day: currentDay() } });
  changed();
  return { id };
}

function stopSession(id, { tolerance = null, signals = [], notes = '' } = {}) {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id);
  if (!s || s.status !== 'active') return { error: 'No active session with this id', status: 404 };
  const now = Date.now();
  const minutes = Math.round(((now - s.start_ts) / 60000) * 10) / 10;
  const merged = [...new Set([...JSON.parse(s.signals || '[]'), ...signals])];
  db.prepare("UPDATE sessions SET end_ts = ?, minutes = ?, tolerance = ?, signals = ?, notes = ?, status = 'completed' WHERE id = ?").run(now, minutes, tolerance, JSON.stringify(merged), String(notes).slice(0, 280), id);
  enqueue(db, { id: `session-stop:${id}`, priority: PRIORITY.LOG, kind: 'session', summary: `${s.code} · ${s.type} completed`, data: { id, minutes, tolerance, signals: merged } });
  changed();
  return { ok: true, minutes, code: s.code, type: s.type };
}

const validSignals = (list) => (Array.isArray(list) ? list.filter((x) => protocol.safetySignals.some((s) => s.id === x)) : []);

api.post('/sessions/start', (req, res) => {
  const { code, type, parameter } = req.body ?? {};
  if (need(findAstronaut(code), res, 404, 'Unknown astronaut')) return;
  const r = startSession(code, type, parameter);
  if (r.error) return res.status(r.status).json(r);
  res.json(r);
});

api.post('/sessions/:id/signal', (req, res) => {
  const s = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (need(s, res, 404, 'Unknown session')) return;
  const signals = validSignals(req.body?.signals);
  if (need(signals.length, res, 400, 'Select at least one signal')) return;
  const merged = [...new Set([...JSON.parse(s.signals || '[]'), ...signals])];
  db.prepare('UPDATE sessions SET signals = ? WHERE id = ?').run(JSON.stringify(merged), s.id);
  changed();
  res.json({ ok: true, message: 'URGENT alert sent to the flight surgeon.' });
});

api.post('/sessions/:id/stop', (req, res) => {
  const b = req.body ?? {};
  const r = stopSession(req.params.id, { tolerance: b.tolerance == null ? null : level03(b.tolerance), signals: validSignals(b.signals), notes: b.notes || '' });
  if (r.error) return res.status(r.status).json(r);
  res.json(r);
});

api.post('/glasses/issue', (req, res) => {
  const { code, glassesId, by } = req.body ?? {};
  if (need(findAstronaut(code), res, 404, 'Unknown astronaut')) return;
  if (need(protocol.glasses.inventory.some((g) => g.id === glassesId), res, 400, 'Unknown glasses id')) return;
  db.prepare('INSERT OR REPLACE INTO glasses_issued VALUES (?, ?, ?, ?)').run(code, glassesId, currentDay(), String(by || 'Flight surgeon').slice(0, 60));
  enqueue(db, { id: `glasses:${code}:${Date.now()}`, priority: PRIORITY.LOG, kind: 'glasses', summary: `${code} · Spare glasses ${glassesId}`, data: { code, glassesId } });
  changed();
  res.json({ ok: true });
});

api.get('/sync', (_req, res) => {
  res.json({ ...radio.status(), ground: { received: ground.count(), duplicates: ground.duplicates, rejected: ground.rejected, latest: ground.latest(8) }, recent: recentItems(db, 14) });
});

api.post('/sync/profile', (req, res) => {
  if (need(radio.setProfile(String(req.body?.profile)), res, 400, 'Unknown profile')) return;
  res.json({ ok: true, link: radio.status().link });
});

api.get('/nasa/tas', (_req, res) => (nasa.tas ? res.json(nasa.tas) : res.status(404).json({ error: 'Run analysis/export_for_app.py first' })));
api.get('/nasa/glds700', (_req, res) => (nasa.glds700 ? res.json(nasa.glds700) : res.status(404).json({ error: 'Run analysis/export_for_app.py first' })));
api.get('/model', (_req, res) => (nasa.model ? res.json(nasa.model) : res.status(404).json({ error: 'Run analysis/export_for_app.py first' })));

api.post('/sync/flush', (_req, res) => {
  radio.forceOpen(12);
  res.json({ ok: true });
});

// Voice assistant: closed vocabulary only, never medical advice. Replies in English or French (body.lang).
// Actions (log, sessions) apply to the speaker (body.code); questions can name another crew member.
api.post('/voice', (req, res) => {
  const { text, code } = req.body ?? {};
  const lang = req.body?.lang === 'fr' ? 'fr' : 'en';
  const R = makeReplies(lang);
  const { t } = R;
  const cmd = parseCommand(text);
  const who = findAstronaut(code) ? code : codes[0];
  const target = cmd.target && findAstronaut(cmd.target) ? cmd.target : null;
  const day = currentDay();
  let reply;
  let ok = true;
  switch (cmd.intent) {
    case 'HELP':
      reply = R.help(lang === 'fr' ? COMMAND_EXAMPLES_FR : COMMAND_EXAMPLES);
      break;
    case 'EMERGENCY':
      reply = R.emergency;
      break;
    case 'START_SESSION': {
      const r = startSession(who, cmd.params.type);
      const def = protocol.countermeasures[cmd.params.type];
      const hours = Math.round((def.targetMinutes / 60) * 10) / 10;
      ok = !r.error;
      reply = r.error ? r.error : t(`${def.label} session started for ${who}. Target ${hours} hours. The safety checklist is on screen.`, `Séance ${cmd.params.type === 'LBNP' ? 'LBNP' : 'de brassards'} démarrée pour ${who}. Objectif ${String(hours).replace('.', ',')} heures. La liste de sécurité est à l’écran.`);
      break;
    }
    case 'STOP_SESSION': {
      const s = activeSessions().find((x) => x.code === who);
      if (!s) {
        ok = false;
        reply = t(`No session in progress for ${who}.`, `Aucune séance en cours pour ${who}.`);
      } else {
        const r = stopSession(s.id);
        reply = t(`Session stopped after ${r.minutes} minutes. Please answer the tolerance and safety questions on screen.`, `Séance arrêtée après ${r.minutes} minutes. Réponds aux questions de tolérance et de sécurité à l’écran.`);
      }
      break;
    }
    case 'LOG_SUPPLEMENT': {
      const a7 = logSupplement(who, true);
      reply = t(`Supplement logged for ${who}, ${dayLabel(day)}. Seven-day adherence ${a7}%.`, `Supplément enregistré pour ${who}, ${R.day(day)}. Observance sur sept jours : ${a7} %.`);
      break;
    }
    case 'LOG_BLURRY': {
      if (cmd.params.level == null) {
        ok = false;
        reply = t('Please say a level from zero to three. For example: blurry vision today, level two.', 'Donne un niveau de zéro à trois. Par exemple : vision floue aujourd’hui, niveau deux.');
        break;
      }
      const r = db.prepare('INSERT INTO symptoms (code, day, blurry, near, far, change, venous, notes, source, ts) VALUES (?, ?, ?, 0, 0, 0, 0, ?, ?, ?)').run(who, day, cmd.params.level, 'Logged by voice', 'onboard', Date.now());
      enqueue(db, { id: `log:${r.lastInsertRowid}`, priority: PRIORITY.LOG, kind: 'symptom_log', summary: `${who} · Voice vision log`, data: { code: who, day, blurry: cmd.params.level } });
      changed();
      reply = t(`Blurry vision level ${cmd.params.level} logged for ${who}. Measurements and logs are reviewed together by the flight surgeon.`, `Vision floue niveau ${cmd.params.level} enregistrée pour ${who}. Le médecin de vol examine les mesures et les journaux ensemble.`);
      break;
    }
    case 'READ_REMINDERS': {
      const p = target ?? who;
      const list = reminders(ctx().m, p, activeSessions());
      reply = list.length ? t(`Reminders for ${p}: ${list.join(' ')}`, `Rappels pour ${p} : ${list.map(R.reminder).join(' ')}`) : t(`No pending reminders for ${p}.`, `Aucun rappel en attente pour ${p}.`);
      break;
    }
    case 'LINK_STATUS': {
      const st = radio.status();
      const open = st.window.open;
      reply = t(
        `Radio window ${open ? 'open' : 'closed'}, ${open ? 'closes' : 'opens'} in ${st.window.secondsToChange} seconds. ${st.queue.queued} items queued, ${st.queue.byPriority[0].count} critical.`,
        `Fenêtre radio ${open ? 'ouverte' : 'fermée'}, ${open ? 'fermeture' : 'ouverture'} dans ${st.window.secondsToChange} secondes. ${st.queue.queued} élément${st.queue.queued > 1 ? 's' : ''} en attente, dont ${st.queue.byPriority[0].count} critique${st.queue.byPriority[0].count > 1 ? 's' : ''}.`,
      );
      break;
    }
    case 'ALERTS': {
      const { alerts } = ctx();
      const rank = { URGENT: 2, WATCH: 1, INFO: 0 };
      const open = [
        ...liveAlerts.filter((a) => !a.acked && !a.resolved),
        ...alerts.filter((a) => !a.acked && a.level !== 'INFO'),
      ].filter((a) => !target || a.code === target).sort((a, b) => rank[b.level] - rank[a.level]);
      if (!open.length) {
        reply = target ? t(`No open alert for ${target}.`, `Aucune alerte ouverte pour ${target}.`) : t('No open alert. The whole crew is stable.', 'Aucune alerte ouverte. Tout l’équipage est stable.');
        break;
      }
      const urgent = open.filter((a) => a.level === 'URGENT').length;
      const head = t(`${open.length} open alert${open.length > 1 ? 's' : ''}, ${urgent} urgent.`, `${open.length} alerte${open.length > 1 ? 's' : ''} ouverte${open.length > 1 ? 's' : ''}, dont ${urgent} urgente${urgent > 1 ? 's' : ''}.`);
      reply = `${head} ${open.slice(0, 3).map((a) => `${a.code}${t(':', ' :')} ${R.title(a.title)}, ${R.level(a.level)}.`).join(' ')}`;
      break;
    }
    case 'VITAL': {
      const list = lastVitals.filter((a) => !target || a.code === target);
      if (!list.length) {
        ok = false;
        reply = t('Live vitals are not available yet.', 'Les constantes en direct ne sont pas encore disponibles.');
        break;
      }
      reply = list.map((a) => `${a.code}${t(':', ' :')} ${R.vital[cmd.params.metric](a.vitals)}.`).join(' ');
      break;
    }
    case 'EYE': {
      const { m, alerts } = ctx();
      const crew = crewSummary(m, alerts).filter((c) => !target || c.code === target);
      reply = `${R.day(day)}. ${crew.map((c) => `${c.code}${t(':', ' :')} ${R.eye[cmd.params.metric](c)}.`).join(' ')}`;
      break;
    }
    case 'CREW_STATUS': {
      const { m, alerts } = ctx();
      const crew = crewSummary(m, alerts).filter((c) => !target || c.code === target);
      const live = new Map(lastVitals.map((a) => [a.code, a]));
      reply = crew
        .map((c) => {
          const v = live.get(c.code);
          const n = (c.alerts.URGENT ?? 0) + (c.alerts.WATCH ?? 0);
          const parts = [t(`SANS risk ${R.risk(c.risk.level)}`, `risque SANS ${R.risk(c.risk.level)}`)];
          if (n) parts.push(t(`${n} open alert${n > 1 ? 's' : ''}`, `${n} alerte${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''}`));
          if (v) parts.push(t(`live vitals ${R.liveWord[v.status.level]}`, `constantes ${R.liveWord[v.status.level]}`));
          if (target) parts.push(R.eye.retina(c));
          return `${c.code}${t(':', ' :')} ${parts.join(', ')}.`;
        })
        .join(' ');
      break;
    }
    case 'MEDICAL_QUESTION':
      ok = false;
      reply = R.medical;
      break;
    case 'EMPTY':
      ok = false;
      reply = R.empty;
      break;
    default:
      ok = false;
      reply = R.unknown;
  }
  db.prepare('INSERT INTO voice_log (ts, code, text, intent, reply) VALUES (?, ?, ?, ?, ?)').run(Date.now(), who, String(text ?? '').slice(0, 200), cmd.intent, reply);
  res.json({ ok, intent: cmd.intent, params: cmd.params, target, reply, code: who, lang });
});

api.get('/voice/log', (_req, res) => res.json(db.prepare('SELECT * FROM voice_log ORDER BY id DESC LIMIT 30').all()));

api.get('/reports/crew', (_req, res) => {
  const { m, alerts } = ctx();
  res.json(crewReport(m, alerts));
});

api.get('/reports/:code', (req, res) => {
  const { m, alerts } = ctx();
  const r = buildReport(m, req.params.code, alerts);
  if (need(r, res, 404, 'Unknown astronaut')) return;
  res.json(r);
});

api.post('/scenario/:name', (req, res) => {
  const ok = vitalsSim.trigger(req.params.name, req.query.target);
  res.status(ok ? 200 : 400).json({ ok });
});

api.post('/demo/reset', (_req, res) => {
  seed(db, { n: 6, seed: 42 });
  ground.reset();
  liveAlerts.length = 0;
  lastLevels.clear();
  codes = db.prepare('SELECT code FROM astronauts ORDER BY code').all().map((r) => r.code);
  vitalsSim = createVitalsSimulator(codes);
  rev += 1;
  cache = null;
  primeQueue();
  changed();
  res.json({ ok: true });
});

app.use('/api/v1', api);
app.use('/api', api);

// Serve the built dashboard when available (single offline process: `npm run build` in client, then `npm start`).
const dist = join(ROOT, '..', 'client', 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api|\/stream).*/, (_req, res) => res.sendFile(join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal error' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SANS Guardian onboard server  http://localhost:${PORT}`);
  console.log(`Mission day ${dayLabel(currentDay())} · landing day ${LANDING_DAY} · demo key: ${usingDemoKey}`);
});

