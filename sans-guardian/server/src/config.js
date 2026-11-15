import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(here, '..');
export const DATA_DIR = join(ROOT, 'data');

/** Protocol, thresholds and schedules. All defaults are demo values owned by the medical team. */
export const protocol = JSON.parse(readFileSync(join(ROOT, 'config', 'protocol.json'), 'utf8'));

export const LANDING_DAY = protocol.mission.missionDays;
export const LAST_DAY = protocol.mission.missionDays + protocol.mission.postFlightDays;
export const FIRST_DAY = protocol.supplement.startOffsetDays;

/** Human label for a mission day: L-30 before launch, FD 42 in flight, R+30 after landing. */
export function dayLabel(day) {
  if (day < 0) return `L${day}`;
  if (day <= LANDING_DAY) return day === LANDING_DAY ? 'Landing' : `FD ${day}`;
  return `R+${day - LANDING_DAY}`;
}

export function phaseOf(day) {
  if (day < 0) return 'pre-flight';
  if (day <= LANDING_DAY) return 'in-flight';
  return 'post-flight';
}
