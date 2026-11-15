// B-vitamin supplement schedule and adherence.
import { protocol, LANDING_DAY } from '../config.js';

export const SUPPLEMENT_FIRST_DAY = protocol.supplement.startOffsetDays;
export const SUPPLEMENT_LAST_DAY = LANDING_DAY + protocol.supplement.endDaysAfterLanding;

export const isSupplementDay = (day) => day >= SUPPLEMENT_FIRST_DAY && day <= SUPPLEMENT_LAST_DAY;

/**
 * Adherence (%) over the `window` days ending at `day` (inclusive).
 * Days inside the schedule with no record count as missed. Returns null outside the schedule.
 */
export function adherence(supplements, code, day, window) {
  const from = Math.max(SUPPLEMENT_FIRST_DAY, day - window + 1);
  const to = Math.min(day, SUPPLEMENT_LAST_DAY);
  if (to < from) return null;
  const taken = new Set(supplements.filter((s) => s.code === code && s.taken && s.day >= from && s.day <= to).map((s) => s.day));
  const expected = to - from + 1;
  return Math.round((100 * taken.size) / expected);
}

/** Per-day status for a calendar view. */
export function supplementCalendar(supplements, code, day) {
  const byDay = new Map(supplements.filter((s) => s.code === code).map((s) => [s.day, s]));
  const out = [];
  for (let d = SUPPLEMENT_FIRST_DAY; d <= SUPPLEMENT_LAST_DAY; d++) {
    const rec = byDay.get(d);
    out.push({ day: d, status: d > day ? 'future' : rec?.taken ? 'taken' : 'missed', time: rec?.time ?? null });
  }
  return out;
}

export function takenToday(supplements, code, day) {
  return supplements.some((s) => s.code === code && s.day === day && s.taken);
}
