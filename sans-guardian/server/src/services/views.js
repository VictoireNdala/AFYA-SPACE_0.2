// Read models for the dashboard and the end-of-mission report.
import { protocol, LANDING_DAY, dayLabel, phaseOf } from '../config.js';
import { round } from '../rng.js';
import { MEASURE_TYPES, series, baselineOf, slopePer30 } from './trends.js';
import { adherence, supplementCalendar, takenToday, isSupplementDay } from './adherence.js';
import { riskProfile } from './risk.js';
import { examCalendar, glassesSuggestion, recovery } from './ocular.js';

const openCounts = (alerts) => {
  const c = { URGENT: 0, WATCH: 0, INFO: 0 };
  for (const a of alerts) if (!a.acked) c[a.level] += 1;
  return c;
};

export function missionInfo(day) {
  return {
    day,
    label: dayLabel(day),
    phase: phaseOf(day),
    launchDate: protocol.mission.launchDate,
    missionDays: protocol.mission.missionDays,
    landingDay: LANDING_DAY,
    firstDay: protocol.supplement.startOffsetDays,
    lastDay: LANDING_DAY + protocol.mission.postFlightDays,
  };
}

export function crewSummary(m, alerts, activeSessions = []) {
  return m.astronauts.map((a) => {
    const retina = series(m, a.code, 'OCT_RETINAL_THICKNESS');
    const refr = series(m, a.code, 'REFRACTION');
    const iop = series(m, a.code, 'IOP');
    const risk = riskProfile(m, a.code);
    const mine = alerts.filter((x) => x.code === a.code);
    const lastLog = m.symptoms.filter((s) => s.code === a.code).at(-1);
    return {
      code: a.code,
      role: a.role,
      risk: { score: risk.score, level: risk.level },
      retina: { delta: retina.at(-1)?.delta ?? null, day: retina.at(-1)?.day ?? null, slope: slopePer30(retina.filter((p) => p.day > 0)), points: retina.map((p) => ({ day: p.day, delta: p.delta })) },
      refraction: { delta: refr.at(-1)?.delta ?? null },
      iop: { value: iop.at(-1)?.value ?? null },
      adherence7: adherence(m.supplements, a.code, m.day, 7),
      adherence30: adherence(m.supplements, a.code, m.day, 30),
      alerts: openCounts(mine),
      examsOverdue: examCalendar(m, a.code).filter((e) => e.status === 'overdue').length,
      lastLog: lastLog ? { day: lastLog.day, blurry: lastLog.blurry } : null,
      activeSession: activeSessions.find((s) => s.code === a.code) ?? null,
    };
  });
}

export function astronautDetail(m, code, alerts, activeSessions = []) {
  const a = m.astronauts.find((x) => x.code === code);
  if (!a) return null;
  const trends = Object.fromEntries(
    Object.entries(MEASURE_TYPES).map(([type, meta]) => [
      type,
      {
        ...meta,
        baseline: baselineOf(m, code, type),
        thresholds: protocol.thresholds[meta.threshold],
        points: series(m, code, type),
        crew: Object.fromEntries(m.astronauts.filter((x) => x.code !== code).map((x) => [x.code, series(m, x.code, type).map((p) => ({ day: p.day, value: p.value, delta: p.delta }))])),
      },
    ]),
  );
  const symptoms = m.symptoms.filter((s) => s.code === code);
  const sessions = m.sessions.filter((s) => s.code === code);
  const venous = [...symptoms.filter((s) => s.venous).map((s) => ({ day: s.day, source: 'Daily log', detail: s.notes || 'Venous signal ticked' })), ...sessions.filter((s) => s.signals.length).map((s) => ({ day: s.day, source: s.type === 'LBNP' ? 'LBNP session' : 'Thigh-cuff session', detail: s.signals.map((id) => protocol.safetySignals.find((x) => x.id === id)?.label ?? id).join(', ') }))].sort((x, y) => y.day - x.day);
  return {
    astronaut: { code: a.code, role: a.role, sex: a.sex, age: a.age, consentGenetics: a.consentGenetics, geneticsEncrypted: a.geneticsEncrypted, variantScore: a.genetics?.oneCarbonVariantScore ?? null },
    risk: riskProfile(m, code),
    trends,
    symptoms: symptoms.map((s) => ({ day: s.day, blurry: s.blurry, near: s.near, far: s.far, change: s.change, venous: s.venous, notes: s.notes })),
    adherence: {
      d7: adherence(m.supplements, code, m.day, 7),
      d30: adherence(m.supplements, code, m.day, 30),
      all: adherence(m.supplements, code, m.day, 10000),
      takenToday: takenToday(m.supplements, code, m.day),
      scheduledToday: isSupplementDay(m.day),
      calendar: supplementCalendar(m.supplements, code, m.day),
    },
    sessions: sessions.slice().reverse(),
    activeSession: activeSessions.find((s) => s.code === code) ?? null,
    exams: examCalendar(m, code),
    glasses: glassesSuggestion(m, code),
    recovery: recovery(m, code),
    venous,
    returnProtocol: protocol.returnProtocol,
    wellbeing: m.wellbeing.filter((w) => w.code === code).slice(-30),
    alerts: alerts.filter((x) => x.code === code),
  };
}

export function reminders(m, code, activeSessions = []) {
  const out = [];
  if (isSupplementDay(m.day) && !takenToday(m.supplements, code, m.day)) out.push('B-vitamin supplement not logged yet today.');
  for (const e of examCalendar(m, code)) {
    if (e.status === 'due') out.push(`Exam due: ${e.label}.`);
    if (e.status === 'overdue') out.push(`Exam overdue: ${e.label}.`);
  }
  const active = activeSessions.find((s) => s.code === code);
  if (active) out.push(`${active.type === 'LBNP' ? 'LBNP' : 'Thigh-cuff'} session in progress.`);
  if (!m.symptoms.some((s) => s.code === code && s.day === m.day) && m.day > 0 && m.day <= LANDING_DAY) out.push('Daily vision log not filled in yet.');
  return out;
}

/** Individual end-of-mission report (data only; the client renders and prints it). */
export function buildReport(m, code, alerts) {
  const d = astronautDetail(m, code, alerts);
  if (!d) return null;
  const last = (type) => d.trends[type].points.at(-1) ?? null;
  const sessions = { THIGH_CUFF: d.sessions.filter((s) => s.type === 'THIGH_CUFF'), LBNP: d.sessions.filter((s) => s.type === 'LBNP') };
  return {
    generatedAt: new Date().toISOString(),
    mission: missionInfo(m.day),
    ...d,
    summary: {
      retina: last('OCT_RETINAL_THICKNESS'),
      refraction: last('REFRACTION'),
      iop: last('IOP'),
      peakRetinaDelta: Math.max(...d.trends.OCT_RETINAL_THICKNESS.points.map((p) => p.delta ?? -Infinity)),
      sessionCounts: { THIGH_CUFF: sessions.THIGH_CUFF.length, LBNP: sessions.LBNP.length },
      sessionMinutes: round(d.sessions.reduce((t, s) => t + (s.minutes || 0), 0), 0),
      alertsByLevel: { URGENT: d.alerts.filter((a) => a.level === 'URGENT').length, WATCH: d.alerts.filter((a) => a.level === 'WATCH').length, INFO: d.alerts.filter((a) => a.level === 'INFO').length },
      symptomDays: d.symptoms.filter((s) => s.blurry > 0 || s.near > 0 || s.far > 0).length,
      loggedDays: d.symptoms.length,
    },
    disclaimers: [
      'Research prototype. Not a medical device. Simulated data.',
      'SANS has no established treatment and its exact cause is unknown. B vitamins, thigh cuffs and LBNP are NASA research countermeasures, not proven treatments.',
      'All thresholds, weights and schedules are demo values set in config/protocol.json, to be defined by the medical team.',
      'The absence of symptoms does not exclude SANS: measurements and self-reports are reviewed together.',
    ],
  };
}

/** Crew-level (global) report. */
export function crewReport(m, alerts) {
  const crew = crewSummary(m, alerts);
  return {
    generatedAt: new Date().toISOString(),
    mission: missionInfo(m.day),
    crew,
    totals: {
      crewSize: crew.length,
      highRisk: crew.filter((c) => c.risk.level === 'high').length,
      openUrgent: crew.reduce((t, c) => t + c.alerts.URGENT, 0),
      openWatch: crew.reduce((t, c) => t + c.alerts.WATCH, 0),
      meanAdherence30: Math.round(crew.reduce((t, c) => t + (c.adherence30 ?? 0), 0) / Math.max(1, crew.length)),
      alertsTotal: alerts.length,
    },
  };
}
