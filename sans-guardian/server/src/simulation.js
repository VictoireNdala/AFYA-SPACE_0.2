// Deterministic generator of SIMULATED crew data for a 180-day mission.
// Nothing here is real astronaut data. Shape parameters below are demo values chosen to
// illustrate the NASA facts used in the project (first changes ~30 days into flight,
// refraction change up to ~1.5 D, partial recovery between 90 days and 6 months after return).

import { mulberry32, gauss, clamp, round } from './rng.js';
import { protocol, LANDING_DAY, LAST_DAY } from './config.js';

const SIM = {
  onsetDay: 30, // NASA: first changes observed around 30 days of flight
  retinaMaxUm: 55, // demo value
  refractionMaxD: 1.4, // demo value, kept under the ~1.5 D reported by NASA
  growthTau: 60, // demo value (days)
  recoveryTau: 55, // demo value (days)
};

/** Hand-written profiles so the demo tells a clear story. Extra crew (n > 6) are random. */
export const PROFILES = [
  { code: 'AST-001', role: 'Commander', sex: 'F', age: 47, variant: 0, adherence: 0.97, drift: 0.12, symptomGain: 1, consent: true },
  { code: 'AST-002', role: 'Pilot', sex: 'M', age: 41, variant: 1, adherence: 0.93, drift: 0.25, symptomGain: 1, consent: true, venousDay: 98 },
  { code: 'AST-003', role: 'Flight engineer', sex: 'M', age: 52, variant: 2, adherence: 0.72, drift: 1.0, symptomGain: 1.2, consent: true, persistent: 0.32 },
  { code: 'AST-004', role: 'Medical officer', sex: 'F', age: 39, variant: 0, adherence: 0.98, drift: 0.06, symptomGain: 1, consent: true },
  { code: 'AST-005', role: 'Mission specialist', sex: 'F', age: 44, variant: 1, adherence: 0.86, drift: 0.62, symptomGain: 0, consent: true },
  { code: 'AST-006', role: 'Science officer', sex: 'M', age: 36, variant: 0, adherence: 0.95, drift: 0.15, symptomGain: 1, consent: false, missedExamDay: 120 },
];

/** Normalised SANS-like change over the mission (0 before onset, ~1 at landing, decays after). */
export function driftShape(day, persistent = 0.05) {
  if (day <= SIM.onsetDay) return 0;
  const grow = (d) => 1 - Math.exp(-(d - SIM.onsetDay) / SIM.growthTau);
  if (day <= LANDING_DAY) return grow(day);
  const atLanding = grow(LANDING_DAY);
  return atLanding * (persistent + (1 - persistent) * Math.exp(-(day - LANDING_DAY) / SIM.recoveryTau));
}

const MEASURE_DAYS = (() => {
  const days = [-90, -60, -30];
  for (let d = 10; d <= LANDING_DAY; d += 10) days.push(d);
  days.push(190, 210, 240, 270, 315, 360);
  return days;
})();

function makeProfile(i, rand) {
  if (i < PROFILES.length) return PROFILES[i];
  return {
    code: `AST-${String(i + 1).padStart(3, '0')}`,
    role: 'Mission specialist',
    sex: rand() < 0.5 ? 'F' : 'M',
    age: 32 + Math.floor(rand() * 26),
    variant: Math.floor(rand() * 3),
    adherence: round(0.7 + rand() * 0.29, 2),
    drift: round(rand() ** 2 * 0.9, 2), // skewed so about 20% of missions show significant change (NASA)
    symptomGain: rand() < 0.3 ? 0 : 1,
    consent: rand() < 0.85,
  };
}

/**
 * Generate the full simulated dataset.
 * @param {{n?: number, seed?: number}} opts
 */
export function generate({ n = 6, seed = 42 } = {}) {
  const rand = mulberry32(seed);
  const out = { astronauts: [], baselines: [], measurements: [], symptoms: [], supplements: [], sessions: [], wellbeing: [] };

  for (let i = 0; i < n; i++) {
    const p = makeProfile(i, rand);
    const persistent = p.persistent ?? 0.05;
    const base = {
      OCT_RETINAL_THICKNESS: round(gauss(rand, 250, 12), 1), // same demo scale as the analysis module
      REFRACTION: round(gauss(rand, -0.4, 0.6), 2),
      IOP: round(gauss(rand, 15, 1.3), 1),
      VISUAL_FIELD_MD: round(gauss(rand, -0.4, 0.3), 2),
    };

    out.astronauts.push({
      code: p.code,
      role: p.role,
      sex: p.sex,
      launchDate: protocol.mission.launchDate,
      missionDays: protocol.mission.missionDays,
      consentGenetics: p.consent,
      genetics: { oneCarbonVariantScore: p.variant, sampled: '2025-09-01', note: 'Fictional value for the demo' },
      profile: { age: p.age, drift: p.drift, adherence: p.adherence, symptomGain: p.symptomGain },
    });

    // Measurements: pre-flight, every 10 days in flight, then post-flight follow-up.
    const pre = { OCT_RETINAL_THICKNESS: [], REFRACTION: [], IOP: [] };
    for (const day of MEASURE_DAYS) {
      if (day === p.missedExamDay) continue;
      const s = driftShape(day, persistent) * p.drift;
      const source = day > 0 && day <= LANDING_DAY ? 'onboard' : 'ground';
      const retina = round(base.OCT_RETINAL_THICKNESS + SIM.retinaMaxUm * s + gauss(rand, 0, 2.2), 1);
      const refr = round(base.REFRACTION + SIM.refractionMaxD * s + gauss(rand, 0, 0.06), 2);
      const iop = round(base.IOP + 1.6 * s + gauss(rand, 0, 0.8), 1);
      out.measurements.push(
        { code: p.code, day, type: 'OCT_RETINAL_THICKNESS', value: retina, unit: 'µm', source },
        { code: p.code, day, type: 'REFRACTION', value: refr, unit: 'D', source },
        { code: p.code, day, type: 'IOP', value: iop, unit: 'mmHg', source },
      );
      if (day % 30 === 0 || day < 0) {
        out.measurements.push({ code: p.code, day, type: 'VISUAL_FIELD_MD', value: round(base.VISUAL_FIELD_MD - 0.9 * s + gauss(rand, 0, 0.25), 2), unit: 'dB', source });
      }
      if (day < 0) {
        pre.OCT_RETINAL_THICKNESS.push(retina);
        pre.REFRACTION.push(refr);
        pre.IOP.push(iop);
      }
    }
    for (const [type, values] of Object.entries(pre)) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      const unit = type === 'OCT_RETINAL_THICKNESS' ? 'µm' : type === 'REFRACTION' ? 'D' : 'mmHg';
      out.baselines.push({ code: p.code, type, value: round(mean, type === 'REFRACTION' ? 2 : 1), unit });
    }

    // Daily vision log in flight. Some astronauts show changes WITHOUT symptoms (symptomGain 0).
    for (let day = 1; day <= LANDING_DAY; day++) {
      if (rand() > 0.9) continue; // not every day is logged
      const s = driftShape(day, persistent) * p.drift;
      const g = p.symptomGain;
      const noise = g ? 0.42 : 0.18;
      const venous = day === p.venousDay;
      out.symptoms.push({
        code: p.code,
        day,
        blurry: clamp(Math.round(g * s * 2.6 + gauss(rand, 0, noise)), 0, 3),
        near: clamp(Math.round(g * s * 2.2 + gauss(rand, 0, noise)), 0, 3),
        far: clamp(Math.round(gauss(rand, 0, noise * 0.8)), 0, 3),
        change: clamp(Math.round(g * s * 1.4 + gauss(rand, 0, noise)), 0, 3),
        venous,
        notes: venous ? 'Reported swelling of the left calf after the thigh-cuff session.' : '',
        source: 'onboard',
      });
    }

    // B-vitamin supplement log, from 6 months before launch to 30 days after landing.
    const lastSuppDay = LANDING_DAY + protocol.supplement.endDaysAfterLanding;
    let missedYesterday = false;
    for (let day = protocol.supplement.startOffsetDays; day <= lastSuppDay; day++) {
      const pTake = missedYesterday ? p.adherence - 0.25 : p.adherence;
      const taken = rand() < pTake;
      missedYesterday = !taken;
      const minute = Math.floor(rand() * 50);
      out.supplements.push({ code: p.code, day, taken, time: taken ? `08:${String(minute).padStart(2, '0')}` : null, source: day > 0 && day <= LANDING_DAY ? 'onboard' : 'ground' });
    }

    // Countermeasure sessions: 2 thigh-cuff sessions (NASA study design), LBNP for some crew.
    for (const day of [45, 98]) {
      const venous = day === p.venousDay;
      out.sessions.push({
        id: `S-${p.code}-CUFF-${day}`,
        code: p.code,
        type: 'THIGH_CUFF',
        day,
        minutes: venous ? 284 : 352 + Math.round(rand() * 10),
        parameter: protocol.countermeasures.THIGH_CUFF.defaultParameter,
        tolerance: venous ? 2 : Math.round(rand()),
        signals: venous ? ['limb_swelling'] : [],
        notes: venous ? 'Session stopped early. Flight surgeon notified.' : '',
        status: 'completed',
      });
    }
    if (i % 2 === 0) {
      for (const day of [60, 110, 160]) {
        out.sessions.push({
          id: `S-${p.code}-LBNP-${day}`,
          code: p.code,
          type: 'LBNP',
          day,
          minutes: 30,
          parameter: protocol.countermeasures.LBNP.defaultParameter,
          tolerance: Math.round(rand()),
          signals: [],
          notes: '',
          status: 'completed',
        });
      }
    }

    // Daily wellbeing check-in (mental health part of the original brief).
    let mood = 3 + rand();
    let stress = 3 + rand() * 2;
    for (let day = -14; day <= LAST_DAY; day++) {
      if (day > LANDING_DAY + 30) break;
      mood = clamp(mood + gauss(rand, 0, 0.35) + (3.2 - mood) * 0.15, 1, 4);
      stress = clamp(stress + gauss(rand, 0, 0.6) + (3.5 - stress) * 0.12, 0, 10);
      out.wellbeing.push({ code: p.code, day, mood: round(mood, 1), stress: round(stress, 1), sleep: round(clamp(gauss(rand, 6.9, 0.5), 4.5, 8.5), 1) });
    }
  }
  return out;
}
