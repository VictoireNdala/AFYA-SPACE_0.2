// Exam calendar, spare glasses suggestion and post-flight recovery.
import { protocol, LANDING_DAY } from '../config.js';
import { round } from '../rng.js';
import { series } from './trends.js';

const GRACE = protocol.thresholds.EXAM_GRACE_DAYS;

/** Exam schedule with a status for each slot: done, due, overdue or upcoming. */
export function examCalendar(m, code) {
  const ocTDays = new Set(m.measurements.filter((x) => x.code === code && x.type === 'OCT_RETINAL_THICKNESS').map((x) => x.day));
  return protocol.exams.schedule.map((e) => {
    let done = false;
    for (let d = e.day - GRACE; d <= e.day + GRACE; d++) if (ocTDays.has(d)) done = true;
    let status = 'upcoming';
    if (done) status = 'done';
    else if (m.day > e.day + GRACE) status = 'overdue';
    else if (m.day >= e.day - GRACE) status = 'due';
    return { ...e, types: protocol.exams.types, status };
  });
}

/** Closest spare pair to the latest measured refraction. Always to be confirmed by the flight surgeon. */
export function glassesSuggestion(m, code) {
  const s = series(m, code, 'REFRACTION');
  const last = s.at(-1);
  if (!last) return null;
  const inv = protocol.glasses.inventory.map((g) => {
    const issued = Object.values(m.glassesIssued).filter((x) => x.glasses_id === g.id).length;
    return { ...g, available: Math.max(0, g.pairs - issued) };
  });
  const candidates = inv.filter((g) => g.available > 0);
  const best = candidates.reduce((b, g) => (!b || Math.abs(g.power - last.value) < Math.abs(b.power - last.value) ? g : b), null);
  return {
    measured: last.value,
    delta: last.delta,
    measuredDay: last.day,
    suggestion: best,
    inventory: inv,
    issued: m.glassesIssued[code] ?? null,
    note: 'Suggestion only. To be confirmed by the flight surgeon.',
  };
}

/** Post-flight recovery toward baseline, with R+30 / R+90 / R+6 months milestones. */
export function recovery(m, code) {
  const s = series(m, code, 'OCT_RETINAL_THICKNESS');
  const atLanding = s.filter((p) => p.day <= LANDING_DAY).at(-1);
  const post = s.filter((p) => p.day > LANDING_DAY);
  const th = protocol.thresholds.PERSISTENT_RETINA_UM;
  const milestones = [30, 90, 180].map((r) => {
    const target = LANDING_DAY + r;
    const pt = post.find((p) => Math.abs(p.day - target) <= 15) ?? null;
    return { label: r === 180 ? 'R+6 months' : `R+${r}`, day: target, delta: pt ? pt.delta : null, reached: m.day >= target };
  });
  if (m.day <= LANDING_DAY || !atLanding) {
    return { started: false, landingDelta: atLanding?.delta ?? null, milestones, points: [], persistent: false, threshold: th.watch };
  }
  const last = post.at(-1) ?? atLanding;
  const recoveredPct = atLanding.delta > 0 ? round(100 * (1 - last.delta / atLanding.delta), 0) : null;
  const persistent = m.day >= LANDING_DAY + 150 && last.delta > th.watch;
  return { started: true, landingDelta: atLanding.delta, currentDelta: last.delta, recoveredPct, milestones, points: [atLanding, ...post], persistent, threshold: th.watch };
}
