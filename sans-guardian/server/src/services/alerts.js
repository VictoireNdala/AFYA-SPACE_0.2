// Readable rule engine for graded alerts (INFO / WATCH / URGENT).
// Every alert states the rule, the value and the threshold. Messages describe; they never interpret or prescribe.
import { protocol, LANDING_DAY, dayLabel } from '../config.js';
import { MEASURE_TYPES, series, comparable, levelFor } from './trends.js';
import { adherence, SUPPLEMENT_FIRST_DAY, SUPPLEMENT_LAST_DAY } from './adherence.js';
import { examCalendar } from './ocular.js';

export const LEVELS = ['INFO', 'WATCH', 'URGENT'];
export const LEVEL_RANK = { INFO: 1, WATCH: 2, URGENT: 3 };
const TH = protocol.thresholds;
const signalLabel = (id) => protocol.safetySignals.find((s) => s.id === id)?.label ?? id;
const fmt = (v, unit, signed = false) => `${signed && v > 0 ? '+' : ''}${v} ${unit}`;

function measurementAlerts(m, code) {
  const out = [];
  for (const [type, meta] of Object.entries(MEASURE_TYPES)) {
    const th = TH[meta.threshold];
    let current = 0;
    for (const p of series(m, code, type)) {
      if (p.day <= 0) continue;
      const v = comparable(type, p);
      const lvl = levelFor(v, th);
      if (lvl > current) {
        const level = lvl === 2 ? 'URGENT' : 'WATCH';
        const limit = lvl === 2 ? th.urgent : th.watch;
        const shown = meta.mode === 'value' ? fmt(p.value, meta.unit) : `${fmt(p.delta, meta.unit, true)} vs baseline`;
        out.push({
          id: `${meta.threshold}:${code}:${p.day}`,
          code,
          day: p.day,
          level,
          rule: meta.threshold,
          title: th.label,
          message: `${meta.label}: ${shown}. ${level} threshold is ${limit} ${meta.unit} (demo value).`,
          value: meta.mode === 'value' ? p.value : p.delta,
          threshold: limit,
          unit: meta.unit,
        });
      }
      current = lvl;
    }
  }
  return out;
}

function venousAlerts(m, code) {
  const out = [];
  for (const s of m.sessions.filter((x) => x.code === code && x.signals.length)) {
    out.push({
      id: `VENOUS_SIGNAL:${s.id}`,
      code,
      day: s.day,
      level: 'URGENT',
      rule: 'VENOUS_SIGNAL',
      title: 'Safety signal during countermeasure session',
      message: `Reported during ${s.type === 'LBNP' ? 'LBNP' : 'thigh-cuff'} session: ${s.signals.map(signalLabel).join(', ')}. Flight surgeon review requested.`,
      value: s.signals.length,
      threshold: 1,
      unit: 'signal',
      ref: s.id,
    });
  }
  for (const s of m.symptoms.filter((x) => x.code === code && x.venous)) {
    out.push({
      id: `VENOUS_SIGNAL:${code}:${s.day}:log${s.ts ? `:${s.ts}` : ''}`,
      code,
      day: s.day,
      level: 'URGENT',
      rule: 'VENOUS_SIGNAL',
      title: 'Venous safety signal in daily log',
      message: `Venous signal ticked in the daily log${s.notes ? ` (note: ${s.notes.replace(/[.\s]+$/, '')})` : ''}. Flight surgeon review requested.`,
      value: 1,
      threshold: 1,
      unit: 'signal',
    });
  }
  return out;
}

function adherenceAlerts(m, code) {
  const out = [];
  const limit = protocol.supplement.adherenceWatchBelowPct;
  let below = false;
  for (let d = SUPPLEMENT_FIRST_DAY + 29; d <= Math.min(m.day, SUPPLEMENT_LAST_DAY); d += 7) {
    const pct = adherence(m.supplements, code, d, 30);
    const isBelow = pct != null && pct < limit;
    if (isBelow && !below) {
      out.push({
        id: `ADHERENCE_30D:${code}:${d}`,
        code,
        day: d,
        level: 'WATCH',
        rule: 'ADHERENCE_30D',
        title: 'Supplement adherence below target',
        message: `30-day B-vitamin adherence is ${pct}%. WATCH below ${limit}% (demo value).`,
        value: pct,
        threshold: limit,
        unit: '%',
      });
    }
    below = isBelow;
  }
  return out;
}

function examAlerts(m, code) {
  return examCalendar(m, code)
    .filter((e) => e.status === 'overdue')
    .map((e) => ({
      id: `EXAM_OVERDUE:${code}:${e.day}`,
      code,
      day: e.day + TH.EXAM_GRACE_DAYS + 1,
      level: 'INFO',
      rule: 'EXAM_OVERDUE',
      title: 'Scheduled exam not recorded',
      message: `"${e.label}" (${e.types.join(', ')}) has no recorded result. Scheduled ${dayLabel(e.day)}.`,
      value: m.day - e.day,
      threshold: TH.EXAM_GRACE_DAYS,
      unit: 'days late',
    }));
}

function persistenceAlerts(m, code) {
  const th = TH.PERSISTENT_RETINA_UM;
  const late = series(m, code, 'OCT_RETINAL_THICKNESS').filter((p) => p.day >= LANDING_DAY + 150);
  const p = late.find((x) => x.delta > th.watch);
  if (!p) return [];
  return [{
    id: `PERSISTENT_CHANGE:${code}:${p.day}`,
    code,
    day: p.day,
    level: 'WATCH',
    rule: 'PERSISTENT_CHANGE',
    title: th.label,
    message: `Retinal thickness still ${fmt(p.delta, 'µm', true)} vs baseline at ${dayLabel(p.day)}. WATCH above ${th.watch} µm (demo value).`,
    value: p.delta,
    threshold: th.watch,
    unit: 'µm',
  }];
}

/** Evaluate every rule for the crew, merge acknowledgements, newest and most severe first. */
export function evaluateAlerts(m) {
  const all = [];
  for (const a of m.astronauts) {
    all.push(...measurementAlerts(m, a.code), ...venousAlerts(m, a.code), ...adherenceAlerts(m, a.code), ...examAlerts(m, a.code), ...persistenceAlerts(m, a.code));
  }
  return all
    .map((al) => {
      const ack = m.acks[al.id];
      return { ...al, source: 'mission', acked: !!ack, ackedBy: ack?.by ?? null, ackedTs: ack?.ts ?? null };
    })
    .sort((x, y) => y.day - x.day || LEVEL_RANK[y.level] - LEVEL_RANK[x.level]);
}
