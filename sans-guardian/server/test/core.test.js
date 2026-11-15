import { test } from 'node:test';
import assert from 'node:assert/strict';

import { generate } from '../src/simulation.js';
import { openDb, seed, loadMission } from '../src/db.js';
import { riskProfile } from '../src/services/risk.js';
import { adherence } from '../src/services/adherence.js';
import { evaluateAlerts } from '../src/services/alerts.js';
import { enqueue, ready, PRIORITY } from '../src/sync/queue.js';
import { RadioLink } from '../src/sync/radio.js';
import { GroundStation } from '../src/sync/ground.js';
import { parseCommand } from '../src/voice/parser.js';
import { encrypt, decrypt } from '../src/crypto.js';

const memDb = (day = 130) => {
  const db = openDb(':memory:');
  seed(db, { n: 6, seed: 42 });
  return { db, m: loadMission(db, day) };
};

test('simulation is deterministic for a given seed', () => {
  const a = generate({ n: 6, seed: 42 });
  const b = generate({ n: 6, seed: 42 });
  const c = generate({ n: 6, seed: 7 });
  assert.deepEqual(a.measurements, b.measurements);
  assert.deepEqual(a.supplements, b.supplements);
  assert.notDeepEqual(a.measurements, c.measurements);
});

test('risk score stays within 0-100 and lists explained factors', () => {
  const { m } = memDb();
  for (const a of m.astronauts) {
    const r = riskProfile(m, a.code);
    assert.ok(r.score >= 0 && r.score <= 100);
    assert.equal(r.factors.length, 4);
    for (const f of r.factors) assert.ok(f.contribution >= 0 && f.contribution <= f.max, `${f.id} within bounds`);
  }
  assert.equal(riskProfile(m, 'AST-003').level, 'high');
  assert.equal(riskProfile(m, 'AST-004').level, 'low');
});

test('genetic factor is excluded without consent', () => {
  const { m } = memDb();
  const r = riskProfile(m, 'AST-006');
  assert.equal(r.factors.find((f) => f.id === 'genetics').contribution, 0);
});

test('adherence counts missing days as missed and raises a WATCH alert below target', () => {
  const supplements = [];
  for (let d = 1; d <= 30; d++) supplements.push({ code: 'X', day: d, taken: d % 2 === 0 });
  assert.equal(adherence(supplements, 'X', 30, 30), 50);
  assert.equal(adherence([], 'X', 30, 30), 0);
  const { m } = memDb();
  const alerts = evaluateAlerts(m).filter((a) => a.rule === 'ADHERENCE_30D');
  assert.ok(alerts.some((a) => a.code === 'AST-003' && a.level === 'WATCH'));
});

test('retinal drift crosses the threshold and raises graded alerts with rule, value and threshold', () => {
  const { m } = memDb();
  const retina = evaluateAlerts(m).filter((a) => a.code === 'AST-003' && a.rule === 'RETINA_DELTA_UM');
  assert.ok(retina.some((a) => a.level === 'WATCH'));
  assert.ok(retina.some((a) => a.level === 'URGENT'));
  for (const a of retina) {
    assert.ok(a.value >= a.threshold);
    assert.match(a.message, /demo value/);
  }
});

test('a venous safety signal is always URGENT', () => {
  const { db } = memDb();
  db.prepare("INSERT INTO sessions VALUES ('S-T', 'AST-001', 'THIGH_CUFF', 130, 1, 0, 0, 40, NULL, '[\"limb_pain\"]', '', 'active')").run();
  const alerts = evaluateAlerts(loadMission(db, 130));
  const venous = alerts.find((a) => a.id === 'VENOUS_SIGNAL:S-T');
  assert.equal(venous.level, 'URGENT');
  assert.equal(venous.acked, false);
});

test('sync queue: priority order, idempotent ids, retry after a lost packet', () => {
  const db = openDb(':memory:');
  assert.equal(enqueue(db, { id: 'log-1', priority: PRIORITY.LOG, kind: 'log', data: { a: 1 } }, 1), true);
  assert.equal(enqueue(db, { id: 'log-1', priority: PRIORITY.LOG, kind: 'log', data: { a: 1 } }, 1), false);
  enqueue(db, { id: 'meas-1', priority: PRIORITY.MEASUREMENT, kind: 'measurement', data: { b: 2 } }, 2);
  enqueue(db, { id: 'alert-1', priority: PRIORITY.CRITICAL, kind: 'alert', data: { c: 3 } }, 3);
  assert.deepEqual(ready(db, 10).map((r) => r.id), ['alert-1', 'meas-1', 'log-1']);

  const ground = new GroundStation(':memory:');
  const outcomes = [0.0, 0.99, 0.99, 0.99]; // first packet lost, the rest delivered
  const radio = new RadioLink({
    db,
    transport: { send: (item, now) => ground.receive(item, now) },
    config: { openSeconds: 10, periodSeconds: 20, bandwidthBytesPerSec: 5000, packetLoss: 0.5, maxBackoffSeconds: 4 },
    now: 0,
    random: () => outcomes.shift() ?? 0.99,
  });
  const first = radio.tick(1000);
  assert.equal(first.events[0].id, 'alert-1');
  assert.equal(first.events[0].result, 'lost');
  assert.equal(ground.count(), 2);
  radio.tick(5000); // after backoff, the alert is retried and delivered
  assert.equal(ground.count(), 3);
  assert.equal(ready(db, 99999).length, 0);

  // A retransmitted item is acknowledged but stored once.
  const item = db.prepare("SELECT * FROM sync_items WHERE id = 'alert-1'").get();
  assert.equal(ground.receive(item).duplicate, true);
  assert.equal(ground.count(), 3);
});

test('nothing is sent while the radio window is closed', () => {
  const db = openDb(':memory:');
  enqueue(db, { id: 'a', priority: 0, kind: 'alert', data: {} }, 0);
  const ground = new GroundStation(':memory:');
  const radio = new RadioLink({ db, transport: { send: (i) => ground.receive(i) }, config: { openSeconds: 5, periodSeconds: 60, bandwidthBytesPerSec: 1000, packetLoss: 0, maxBackoffSeconds: 4 }, now: 0, random: () => 1 });
  radio.tick(30_000);
  assert.equal(ground.count(), 0);
  radio.tick(61_000);
  assert.equal(ground.count(), 1);
});

test('voice parser: closed vocabulary, levels, no medical advice', () => {
  assert.equal(parseCommand('Log supplement taken').intent, 'LOG_SUPPLEMENT');
  assert.equal(parseCommand("j'ai pris ma vitamine").intent, 'LOG_SUPPLEMENT');
  assert.deepEqual(parseCommand('Blurry vision today, level two').params, { level: 2 });
  assert.deepEqual(parseCommand('vision floue niveau trois').params, { level: 3 });
  assert.equal(parseCommand('blurry vision').params.level, null);
  assert.deepEqual(parseCommand('start cuff session'), { intent: 'START_SESSION', params: { type: 'THIGH_CUFF' }, text: 'start cuff session' });
  assert.equal(parseCommand('stop cuff session').intent, 'STOP_SESSION');
  assert.equal(parseCommand("read today's reminders").intent, 'READ_REMINDERS');
  assert.equal(parseCommand('should I take more vitamins?').intent, 'MEDICAL_QUESTION');
  assert.equal(parseCommand('open the pod bay doors').intent, 'UNKNOWN');
});

test('voice parser: crew questions in English and French, with a named astronaut', () => {
  assert.deepEqual(parseCommand('Heart rate of AST-003'), { intent: 'VITAL', params: { metric: 'hr' }, text: 'heart rate of ast-003', target: 'AST-003' });
  assert.equal(parseCommand("Rythme cardiaque d'AST 3").target, 'AST-003');
  assert.deepEqual(parseCommand('Épaisseur rétinienne du pilote').params, { metric: 'retina' });
  assert.equal(parseCommand('Épaisseur rétinienne du pilote').target, 'AST-002');
  assert.equal(parseCommand("État de l'équipage").intent, 'CREW_STATUS');
  assert.equal(parseCommand('Comment va la commandante ?').target, 'AST-001');
  assert.equal(parseCommand('Alertes').intent, 'ALERTS');
  assert.equal(parseCommand('pression de l’œil de astronaute cinq').params.metric, 'iop');
  assert.equal(parseCommand('pression de l’œil de astronaute cinq').target, 'AST-005');
  assert.equal(parseCommand('radiation dose rate').intent, 'VITAL');
  assert.equal(parseCommand('Démarrer la séance de brassards').intent, 'START_SESSION');
  assert.equal(parseCommand('urgence').intent, 'EMERGENCY');
  assert.equal(parseCommand('est-ce grave docteur ?').intent, 'MEDICAL_QUESTION');
  assert.equal(parseCommand('AST-006').intent, 'CREW_STATUS');
});

test('genetic data is encrypted at rest', () => {
  const token = encrypt({ oneCarbonVariantScore: 2 });
  assert.ok(!token.includes('oneCarbon'));
  assert.deepEqual(decrypt(token), { oneCarbonVariantScore: 2 });
  const { db } = memDb();
  const row = db.prepare("SELECT genetic_enc FROM astronauts WHERE code = 'AST-003'").get();
  assert.ok(row.genetic_enc && !row.genetic_enc.includes('Variant'));
  assert.equal(db.prepare("SELECT genetic_enc FROM astronauts WHERE code = 'AST-006'").get().genetic_enc, null);
});

test('radio: a frame damaged by noise fails the CRC check, is not acknowledged, then is resent', () => {
  const db = openDb(':memory:');
  enqueue(db, { id: 'a', priority: 0, kind: 'alert', data: { x: 1 } }, 0);
  const ground = new GroundStation(':memory:');
  // draws: loss check 0.9 (kept), corruption check 0.0 (damaged), then bit-flip positions; second send clean
  const draws = [0.9, 0.0, 0.5, 0.5, 0.5, 0.9, 0.9];
  const radio = new RadioLink({ db, transport: { send: (f) => ground.receive(f) }, config: { openSeconds: 60, periodSeconds: 60, bandwidthBytesPerSec: 5000, packetLoss: 0.5, corruption: 0.5, maxBackoffSeconds: 4 }, now: 0, random: () => draws.shift() ?? 0.9 });
  const t1 = radio.tick(1000);
  assert.equal(t1.events[0].result, 'corrupted');
  assert.equal(ground.count(), 0);
  assert.equal(ground.rejected, 1);
  radio.tick(4000);
  assert.equal(ground.count(), 1);
});

test('radio: Moon distance adds about 1.3 s each way before the ack comes back', () => {
  const db = openDb(':memory:');
  enqueue(db, { id: 'a', priority: 0, kind: 'alert', data: {} }, 0);
  const ground = new GroundStation(':memory:');
  const radio = new RadioLink({ db, transport: { send: (f) => ground.receive(f) }, config: { openSeconds: 60, periodSeconds: 60, bandwidthBytesPerSec: 5000, packetLoss: 0, maxBackoffSeconds: 4 }, now: 0, random: () => 0.9 });
  radio.setProfile('MOON');
  radio.tick(1000);
  assert.equal(ground.count(), 0); // still travelling
  radio.tick(2400);
  assert.equal(ground.count(), 1); // arrived after ~1.28 s
  assert.equal(ready(db, 2400).length, 0); // waiting for the ack, not resent yet
  radio.tick(3800);
  assert.equal(db.prepare("SELECT status FROM sync_items WHERE id = 'a'").get().status, 'acked');
});