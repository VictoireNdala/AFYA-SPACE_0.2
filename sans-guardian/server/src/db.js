// Local-first storage: everything is written to SQLite on board first (onboard.db).
// Uses Node's built-in SQLite (Node 22.13+), so there is no native dependency to install.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, protocol } from './config.js';
import { encrypt, decrypt } from './crypto.js';
import { generate } from './simulation.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS astronauts (
  code TEXT PRIMARY KEY, role TEXT, sex TEXT, launch_date TEXT, mission_days INTEGER,
  consent_genetics INTEGER NOT NULL DEFAULT 0, genetic_enc TEXT, profile TEXT);
CREATE TABLE IF NOT EXISTS baselines (code TEXT, type TEXT, value REAL, unit TEXT, PRIMARY KEY (code, type));
CREATE TABLE IF NOT EXISTS measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, day INTEGER, type TEXT, value REAL, unit TEXT, source TEXT);
CREATE INDEX IF NOT EXISTS idx_meas ON measurements (code, type, day);
CREATE TABLE IF NOT EXISTS symptoms (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, day INTEGER, blurry INTEGER, near INTEGER, far INTEGER,
  change INTEGER, venous INTEGER, notes TEXT, source TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS supplements (code TEXT, day INTEGER, taken INTEGER, time TEXT, source TEXT, PRIMARY KEY (code, day));
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, code TEXT, type TEXT, day INTEGER, start_ts INTEGER, end_ts INTEGER, minutes REAL,
  parameter REAL, tolerance INTEGER, signals TEXT, notes TEXT, status TEXT);
CREATE TABLE IF NOT EXISTS wellbeing (code TEXT, day INTEGER, mood REAL, stress REAL, sleep REAL, PRIMARY KEY (code, day));
CREATE TABLE IF NOT EXISTS acks (alert_id TEXT PRIMARY KEY, by TEXT, ts INTEGER);
CREATE TABLE IF NOT EXISTS alerts_seen (alert_id TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS glasses_issued (code TEXT PRIMARY KEY, glasses_id TEXT, day INTEGER, by TEXT);
CREATE TABLE IF NOT EXISTS sync_items (
  id TEXT PRIMARY KEY, priority INTEGER, kind TEXT, summary TEXT, payload BLOB, bytes INTEGER, raw_bytes INTEGER, status TEXT,
  attempts INTEGER DEFAULT 0, next_try INTEGER DEFAULT 0, created_ts INTEGER, sent_ts INTEGER, acked_ts INTEGER);
CREATE INDEX IF NOT EXISTS idx_sync ON sync_items (status, priority, created_ts);
CREATE TABLE IF NOT EXISTS voice_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, code TEXT, text TEXT, intent TEXT, reply TEXT);
`;

export function openDb(file = join(DATA_DIR, 'onboard.db')) {
  if (file !== ':memory:') mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

export function getMeta(db, key, fallback = null) {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
  return row ? JSON.parse(row.value) : fallback;
}

export function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
}

/** Wipe mission data and load a freshly generated simulated dataset. */
export function seed(db, { n = 6, seed: s = 42 } = {}) {
  const data = generate({ n, seed: s });
  db.exec('BEGIN');
  try {
    for (const t of ['astronauts', 'baselines', 'measurements', 'symptoms', 'supplements', 'sessions', 'wellbeing', 'acks', 'alerts_seen', 'glasses_issued', 'sync_items', 'voice_log', 'meta']) {
      db.exec(`DELETE FROM ${t}`);
    }
    const insA = db.prepare('INSERT INTO astronauts VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    for (const a of data.astronauts) {
      insA.run(a.code, a.role, a.sex, a.launchDate, a.missionDays, a.consentGenetics ? 1 : 0, a.consentGenetics ? encrypt(a.genetics) : null, JSON.stringify(a.profile));
    }
    const insB = db.prepare('INSERT INTO baselines VALUES (?, ?, ?, ?)');
    for (const b of data.baselines) insB.run(b.code, b.type, b.value, b.unit);
    const insM = db.prepare('INSERT INTO measurements (code, day, type, value, unit, source) VALUES (?, ?, ?, ?, ?, ?)');
    for (const m of data.measurements) insM.run(m.code, m.day, m.type, m.value, m.unit, m.source);
    const insS = db.prepare('INSERT INTO symptoms (code, day, blurry, near, far, change, venous, notes, source, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)');
    for (const s2 of data.symptoms) insS.run(s2.code, s2.day, s2.blurry, s2.near, s2.far, s2.change, s2.venous ? 1 : 0, s2.notes, s2.source);
    const insP = db.prepare('INSERT INTO supplements VALUES (?, ?, ?, ?, ?)');
    for (const p of data.supplements) insP.run(p.code, p.day, p.taken ? 1 : 0, p.time, p.source);
    const insC = db.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?)');
    for (const c of data.sessions) insC.run(c.id, c.code, c.type, c.day, c.minutes, c.parameter, c.tolerance, JSON.stringify(c.signals), c.notes, c.status);
    const insW = db.prepare('INSERT INTO wellbeing VALUES (?, ?, ?, ?, ?)');
    for (const w of data.wellbeing) insW.run(w.code, w.day, w.mood, w.stress, w.sleep);
    // The historical venous-signal alert was already handled by the flight surgeon.
    for (const c of data.sessions.filter((x) => x.signals.length)) {
      db.prepare('INSERT OR IGNORE INTO acks VALUES (?, ?, ?)').run(`VENOUS_SIGNAL:${c.id}`, 'Flight surgeon (sim)', 0);
      db.prepare('INSERT OR IGNORE INTO acks VALUES (?, ?, ?)').run(`VENOUS_SIGNAL:${c.code}:${c.day}:log`, 'Flight surgeon (sim)', 0);
    }
    setMeta(db, 'currentDay', protocol.mission.defaultDay);
    setMeta(db, 'seed', { n, seed: s, generatedAt: new Date().toISOString() });
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return data;
}

// ---------- Read helpers (always filtered to what has happened by the current mission day) ----------

const parseAstronaut = (r) => {
  let genetics = null;
  if (r.consent_genetics && r.genetic_enc) {
    try {
      genetics = decrypt(r.genetic_enc);
    } catch {
      genetics = null;
    }
  }
  return {
    code: r.code,
    role: r.role,
    sex: r.sex,
    age: (() => { try { return JSON.parse(r.profile || '{}').age ?? null; } catch { return null; } })(),
    launchDate: r.launch_date,
    missionDays: r.mission_days,
    consentGenetics: !!r.consent_genetics,
    geneticsEncrypted: !!r.genetic_enc,
    genetics,
  };
};

export function loadAstronauts(db) {
  return db.prepare('SELECT * FROM astronauts ORDER BY code').all().map(parseAstronaut);
}

export function loadMission(db, day) {
  const astronauts = loadAstronauts(db);
  const baselines = db.prepare('SELECT * FROM baselines').all();
  const measurements = db.prepare('SELECT * FROM measurements WHERE day <= ? ORDER BY day, id').all(day);
  const symptoms = db.prepare('SELECT * FROM symptoms WHERE day <= ? ORDER BY day, id').all(day).map((s) => ({ ...s, venous: !!s.venous }));
  const supplements = db.prepare('SELECT * FROM supplements WHERE day <= ? ORDER BY day').all(day).map((s) => ({ ...s, taken: !!s.taken }));
  const sessions = db.prepare('SELECT * FROM sessions WHERE day <= ? ORDER BY day').all(day).map((s) => ({ ...s, signals: JSON.parse(s.signals || '[]') }));
  const wellbeing = db.prepare('SELECT * FROM wellbeing WHERE day <= ? ORDER BY day').all(day);
  const acks = Object.fromEntries(db.prepare('SELECT * FROM acks').all().map((a) => [a.alert_id, a]));
  const glassesIssued = Object.fromEntries(db.prepare('SELECT * FROM glasses_issued').all().map((g) => [g.code, g]));
  return { day, astronauts, baselines, measurements, symptoms, supplements, sessions, wellbeing, acks, glassesIssued };
}
