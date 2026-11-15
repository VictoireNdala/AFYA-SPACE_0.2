// Export data in the daily CSV format expected by the analysis module (analysis/sans/config.py DATA_COLUMNS):
//  - crew_current.csv : the onboard crew, up to the current mission day (cohort "current");
//  - crew_history.csv : N complete simulated missions from the same onboard simulator (cohort "historical"),
//    so the model is trained on data that follows the same assumptions as the crew it scores.
// Usage: node scripts/export-model-input.js [--day 130] [--history 200] [--seed 2026]
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, LANDING_DAY } from '../src/config.js';
import { openDb, loadMission, getMeta } from '../src/db.js';
import { generate } from '../src/simulation.js';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const OUT_DIR = join(ROOT, '..', 'analysis', 'data');
const COLUMNS = ['astronaut_id', 'cohort', 'day', 'mission_days', 'genetic_variant', 'age', 'sex_f', 'retinal_thickness_um', 'refraction_d', 'iop_mmhg', 'blur_score', 'supplement_taken', 'cuff_hours', 'venous_symptom', 'sleep_hours', 'stress_score', 'sans_significant'];

/** Rows for one dataset (same shape for the database read model and the raw simulator output). */
function toRows(d, { cohort, lastDay, idPrefix = '' }) {
  const rows = [];
  for (const a of d.astronauts) {
    const id = idPrefix + a.code;
    const base = Object.fromEntries(d.baselines.filter((b) => b.code === a.code).map((b) => [b.type, b.value]));
    const meas = (type) => new Map(d.measurements.filter((x) => x.code === a.code && x.type === type && x.day <= lastDay).map((x) => [x.day, x.value]));
    const oct = meas('OCT_RETINAL_THICKNESS');
    const refr = meas('REFRACTION');
    const iop = meas('IOP');
    const sym = new Map();
    for (const s of d.symptoms.filter((x) => x.code === a.code)) sym.set(s.day, { blurry: Math.max(sym.get(s.day)?.blurry ?? 0, s.blurry), venous: (sym.get(s.day)?.venous ?? false) || !!s.venous });
    const supp = new Map(d.supplements.filter((x) => x.code === a.code).map((x) => [x.day, x.taken ? 1 : 0]));
    const cuff = new Map();
    const venousSession = new Set();
    for (const s of d.sessions.filter((x) => x.code === a.code)) {
      if (s.type === 'THIGH_CUFF') cuff.set(s.day, (cuff.get(s.day) ?? 0) + (s.minutes || 0) / 60);
      if (s.signals.length) venousSession.add(s.day);
    }
    const wb = new Map(d.wellbeing.filter((x) => x.code === a.code).map((x) => [x.day, x]));
    // Genetic data only with recorded consent; otherwise the most common category (0) is imputed.
    const variant = a.consentGenetics && a.genetics ? a.genetics.oneCarbonVariantScore : 0;
    const age = a.age ?? a.profile?.age ?? 45;
    for (let day = 1; day <= lastDay; day++) {
      // Day 1 carries the pre-flight baseline so the module's "first week" baseline exists.
      const pick = (map, type) => (day === 1 ? base[type] : map.get(day)) ?? '';
      const w = wb.get(day);
      rows.push([
        id, cohort, day, a.missionDays, variant, age, a.sex === 'F' ? 1 : 0,
        pick(oct, 'OCT_RETINAL_THICKNESS'), pick(refr, 'REFRACTION'), pick(iop, 'IOP'),
        sym.get(day)?.blurry ?? 0, supp.get(day) ?? 0, (cuff.get(day) ?? 0).toFixed(2),
        sym.get(day)?.venous || venousSession.has(day) ? 1 : 0,
        w ? w.sleep : '', w ? Number(w.stress).toFixed(2) : '', '',
      ].join(','));
    }
  }
  return rows;
}

mkdirSync(OUT_DIR, { recursive: true });

// Current crew, from the onboard database.
const db = openDb();
const day = Math.min(LANDING_DAY, Number(arg('day', getMeta(db, 'currentDay', 130))));
const current = toRows(loadMission(db, day), { cohort: 'current', lastDay: day });
writeFileSync(join(OUT_DIR, 'crew_current.csv'), [COLUMNS.join(','), ...current].join('\n') + '\n');

// Historical missions, from the same simulator (random profiles, a different seed from the crew).
const n = Number(arg('history', 200));
const sim = generate({ n: n + 6, seed: Number(arg('seed', 2026)) });
sim.astronauts = sim.astronauts.slice(6); // skip the six hand-written demo profiles
const history = toRows(sim, { cohort: 'historical', lastDay: LANDING_DAY, idPrefix: 'H-' });
writeFileSync(join(OUT_DIR, 'crew_history.csv'), [COLUMNS.join(','), ...history].join('\n') + '\n');

console.log(`Exported the crew (${current.length} rows, days 1-${day}) and ${n} simulated historical missions (${history.length} rows) to ${OUT_DIR}`);
