// Simulateur de capteurs : données SIMULÉES (pas de vraies données médicales).
const CREW = [
  { id: 'a1', name: 'Cdr. Amara', role: 'Commandante', baseline: { hr: 62, spo2: 98, temp: 36.6, sleep: 7.2, stress: 25, radiation: 30 } },
  { id: 'a2', name: 'Pilote Kenji', role: 'Pilote', baseline: { hr: 66, spo2: 98, temp: 36.7, sleep: 6.8, stress: 30, radiation: 30 } },
  { id: 'a3', name: 'Dr. Lucia', role: 'Médecin de bord', baseline: { hr: 60, spo2: 99, temp: 36.5, sleep: 7.5, stress: 20, radiation: 30 } },
];

const SCENARIOS = {
  exercice: { activity: 'exercice', effects: { hr: 75 }, duration: 30 },
  hypoxie: { effects: { spo2: -7, hr: 15 }, duration: 25 },
  radiation: { effects: { radiation: 300 }, duration: 25 },
  fatigue: { effects: { sleep: -3, stress: 50, hr: 8 }, duration: 40 },
  fievre: { effects: { temp: 2, hr: 20 }, duration: 40 },
};

const noise = (s) => (Math.random() - 0.5) * 2 * s;
const NOISE = { hr: 1.5, spo2: 0.3, temp: 0.03, sleep: 0, stress: 1.5, radiation: 2 };
const DECIMALS = { hr: 0, spo2: 0, temp: 1, sleep: 1, stress: 0, radiation: 0 };

export function createSimulator() {
  const state = CREW.map((c) => ({
    ...c,
    values: { ...c.baseline },
    active: [],
    hist: [],
  }));

  function tick() {
    return state.map((s) => {
      const target = { ...s.baseline };
      let activity = 'repos';
      for (const sc of s.active) {
        const def = SCENARIOS[sc.name];
        if (def.activity) activity = def.activity;
        for (const [k, v] of Object.entries(def.effects)) target[k] += v;
      }
      for (const k of Object.keys(target)) {
        s.values[k] += (target[k] - s.values[k]) * 0.3 + noise(NOISE[k]);
      }
      s.active = s.active
        .map((sc) => ({ ...sc, ticksLeft: sc.ticksLeft - 1 }))
        .filter((sc) => sc.ticksLeft > 0);

      const vitals = {};
      for (const k of Object.keys(s.values)) {
        vitals[k] = Number(s.values[k].toFixed(DECIMALS[k]));
      }
      s.hist.push(vitals);
      if (s.hist.length > 120) s.hist.shift();
      return { id: s.id, name: s.name, role: s.role, activity, vitals, baseline: s.baseline };
    });
  }

  function trigger(name, targetId) {
    const def = SCENARIOS[name];
    if (!def) return false;
    const s = state.find((x) => x.id === targetId) || state[0];
    s.active.push({ name, ticksLeft: def.duration });
    return true;
  }

  const history = (id) => (state.find((x) => x.id === id) || { hist: [] }).hist;

  return { tick, trigger, history };
}