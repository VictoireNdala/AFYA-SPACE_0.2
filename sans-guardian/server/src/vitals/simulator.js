// Live wearable-sensor simulator (SIMULATED data, 1 sample per second per crew member).
const BASELINES = {
  'AST-001': { hr: 62, spo2: 98, temp: 36.6, sleep: 7.2, stress: 25, radiation: 30 },
  'AST-002': { hr: 66, spo2: 98, temp: 36.7, sleep: 6.8, stress: 30, radiation: 30 },
  'AST-003': { hr: 64, spo2: 97, temp: 36.6, sleep: 6.4, stress: 38, radiation: 31 },
  'AST-004': { hr: 60, spo2: 99, temp: 36.5, sleep: 7.5, stress: 20, radiation: 29 },
  'AST-005': { hr: 68, spo2: 98, temp: 36.8, sleep: 7.0, stress: 27, radiation: 30 },
  'AST-006': { hr: 63, spo2: 98, temp: 36.6, sleep: 7.1, stress: 24, radiation: 30 },
};

export const SCENARIOS = {
  exercise: { label: 'Exercise session', activity: 'exercise', effects: { hr: 75 }, duration: 30 },
  hypoxia: { label: 'SpO₂ drop', effects: { spo2: -7, hr: 15 }, duration: 25 },
  radiation: { label: 'Radiation spike', effects: { radiation: 300 }, duration: 25 },
  fatigue: { label: 'Fatigue and stress', effects: { sleep: -3, stress: 50, hr: 8 }, duration: 40 },
  fever: { label: 'Temperature rise', effects: { temp: 2, hr: 20 }, duration: 40 },
};

const noise = (s) => (Math.random() - 0.5) * 2 * s;
const NOISE = { hr: 1.5, spo2: 0.3, temp: 0.03, sleep: 0, stress: 1.5, radiation: 2 };
const DECIMALS = { hr: 0, spo2: 0, temp: 1, sleep: 1, stress: 0, radiation: 0 };

export function createVitalsSimulator(codes) {
  const state = codes.map((code) => {
    const baseline = BASELINES[code] ?? BASELINES['AST-001'];
    return { code, baseline, values: { ...baseline }, active: [] };
  });

  function tick() {
    return state.map((s) => {
      const target = { ...s.baseline };
      let activity = 'rest';
      for (const sc of s.active) {
        const def = SCENARIOS[sc.name];
        if (def.activity) activity = def.activity;
        for (const [k, v] of Object.entries(def.effects)) target[k] += v;
      }
      for (const k of Object.keys(target)) s.values[k] += (target[k] - s.values[k]) * 0.3 + noise(NOISE[k]);
      s.active = s.active.map((sc) => ({ ...sc, ticksLeft: sc.ticksLeft - 1 })).filter((sc) => sc.ticksLeft > 0);
      const vitals = {};
      for (const k of Object.keys(s.values)) vitals[k] = Number(s.values[k].toFixed(DECIMALS[k]));
      return { code: s.code, activity, vitals, baseline: s.baseline };
    });
  }

  function trigger(name, code) {
    const def = SCENARIOS[name];
    if (!def) return false;
    const s = state.find((x) => x.code === code) || state[0];
    s.active.push({ name, ticksLeft: def.duration });
    return true;
  }

  return { tick, trigger };
}
