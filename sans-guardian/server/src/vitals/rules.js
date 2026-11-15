// Explainable rules for live vitals, against each astronaut's personal baseline.
// Thresholds come from protocol.json (demo values). Messages describe the reading only.
import { protocol } from '../config.js';

const V = protocol.vitals;
const high = (v, [warn, crit]) => (v >= crit ? 2 : v >= warn ? 1 : 0);
const low = (v, [warn, crit]) => (v <= crit ? 2 : v <= warn ? 1 : 0);

export function evaluateVitals(a) {
  const v = a.vitals;
  const b = a.baseline;
  const exercising = a.activity === 'exercise';
  const hrDelta = v.hr - b.hr;
  const checks = [
    { metric: 'hr', label: 'Heart rate', level: Math.max(high(hrDelta, exercising ? V.hrDeltaExercise : V.hrDeltaRest), low(v.hr, V.hrLow)), message: `${v.hr} bpm (personal baseline ${b.hr} bpm${exercising ? ', exercising' : ''})` },
    { metric: 'spo2', label: 'Oxygen saturation', level: low(v.spo2, V.spo2Low), message: `SpO₂ ${v.spo2}%` },
    { metric: 'temp', label: 'Body temperature', level: high(v.temp, V.tempHigh), message: `${v.temp} °C` },
    { metric: 'sleep', label: 'Sleep', level: low(v.sleep, V.sleepLow), message: `${v.sleep} h of sleep` },
    { metric: 'stress', label: 'Stress index', level: high(v.stress, V.stressHigh), message: `Stress index ${v.stress}/100` },
    { metric: 'radiation', label: 'Radiation dose rate', level: high(v.radiation, V.radiationHigh), message: `${v.radiation} µSv/h` },
  ];
  const level = Math.max(...checks.map((c) => c.level));
  return { level, checks };
}
