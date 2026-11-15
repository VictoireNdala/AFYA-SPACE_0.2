// Ocular trends: values vs pre-flight baseline, rolling slope, threshold levels.
import { round } from '../rng.js';

export const MEASURE_TYPES = {
  OCT_RETINAL_THICKNESS: { label: 'Total retinal thickness (OCT)', unit: 'µm', decimals: 1, threshold: 'RETINA_DELTA_UM', mode: 'delta' },
  REFRACTION: { label: 'Refraction (spherical equivalent)', unit: 'D', decimals: 2, threshold: 'REFRACTION_DELTA_D', mode: 'absDelta' },
  IOP: { label: 'Intraocular pressure', unit: 'mmHg', decimals: 1, threshold: 'IOP_MMHG', mode: 'value' },
};

export function baselineOf(m, code, type) {
  const b = m.baselines.find((x) => x.code === code && x.type === type);
  return b ? b.value : null;
}

/** Time series for one astronaut and one measurement type, with delta vs baseline. */
export function series(m, code, type) {
  const base = baselineOf(m, code, type);
  const d = MEASURE_TYPES[type]?.decimals ?? 2;
  return m.measurements
    .filter((x) => x.code === code && x.type === type)
    .map((x) => ({ day: x.day, value: x.value, delta: base == null ? null : round(x.value - base, d), source: x.source }));
}

/** Least-squares slope of delta over the last `n` points, expressed per 30 days. */
export function slopePer30(points, n = 4) {
  const pts = points.filter((p) => p.delta != null).slice(-n);
  if (pts.length < 2) return 0;
  const mx = pts.reduce((a, p) => a + p.day, 0) / pts.length;
  const my = pts.reduce((a, p) => a + p.delta, 0) / pts.length;
  let num = 0;
  let den = 0;
  for (const p of pts) {
    num += (p.day - mx) * (p.delta - my);
    den += (p.day - mx) ** 2;
  }
  return den === 0 ? 0 : round((num / den) * 30, 2);
}

/** Level of a value against a {watch, urgent} threshold. 0 = none, 1 = WATCH, 2 = URGENT. */
export function levelFor(value, th) {
  if (value == null || !th) return 0;
  if (th.urgent != null && value >= th.urgent) return 2;
  if (th.watch != null && value >= th.watch) return 1;
  return 0;
}

/** The quantity compared with the threshold for a given measurement type. */
export function comparable(type, point) {
  const mode = MEASURE_TYPES[type]?.mode;
  if (mode === 'delta') return point.delta;
  if (mode === 'absDelta') return point.delta == null ? null : Math.abs(point.delta);
  return point.value;
}
