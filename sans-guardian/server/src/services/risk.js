// Transparent, explainable SANS follow-up priority score (0-100).
// Demonstrator only: weights are demo values from protocol.json and nothing here is clinically validated.
import { protocol } from '../config.js';
import { clamp, round } from '../rng.js';
import { adherence } from './adherence.js';
import { series, slopePer30 } from './trends.js';

const W = protocol.risk.weights;
const TH = protocol.thresholds.RETINA_DELTA_UM;

export function levelOf(score) {
  if (score >= protocol.risk.levels.high) return 'high';
  if (score >= protocol.risk.levels.moderate) return 'moderate';
  return 'low';
}

/**
 * @returns {{score:number, level:string, factors:Array<{id:string,label:string,contribution:number,max:number,detail:string}>, disclaimer:string}}
 */
export function riskProfile(m, code) {
  const a = m.astronauts.find((x) => x.code === code);
  const factors = [];

  // 1. Genetics: one-carbon pathway variant score (0-2), only with explicit consent.
  if (a?.consentGenetics && a.genetics) {
    const v = clamp(a.genetics.oneCarbonVariantScore ?? 0, 0, 2);
    factors.push({ id: 'genetics', label: 'One-carbon pathway variants', contribution: round((v / 2) * W.genetics, 1), max: W.genetics, detail: `Variant score ${v} of 2 (encrypted field, consent given)` });
  } else {
    factors.push({ id: 'genetics', label: 'One-carbon pathway variants', contribution: 0, max: W.genetics, detail: 'Excluded: no consent for genetic data' });
  }

  // 2. Mission duration: longer missions carry more risk (NASA).
  const days = a?.missionDays ?? protocol.mission.missionDays;
  factors.push({ id: 'duration', label: 'Mission duration', contribution: round(clamp(days / protocol.risk.durationReferenceDays, 0, 1) * W.duration, 1), max: W.duration, detail: `${days}-day mission` });

  // 3. Supplement adherence over the last 30 days.
  const adh = adherence(m.supplements, code, m.day, 30);
  const adhPart = adh == null ? 0 : clamp((100 - adh) / 40, 0, 1) * W.adherence;
  factors.push({ id: 'adherence', label: 'B-vitamin adherence (30 days)', contribution: round(adhPart, 1), max: W.adherence, detail: adh == null ? 'Outside the supplement schedule' : `${adh}% of doses logged` });

  // 4. Measurement trend: latest retinal thickness change and its slope.
  const s = series(m, code, 'OCT_RETINAL_THICKNESS').filter((p) => p.day > 0);
  const last = s.at(-1);
  const slope = slopePer30(s);
  const trendPart = last ? clamp(last.delta / TH.urgent, 0, 1) * W.trend * 0.7 + clamp(slope / 10, 0, 1) * W.trend * 0.3 : 0;
  factors.push({
    id: 'trend',
    label: 'Retinal thickness trend',
    contribution: round(trendPart, 1),
    max: W.trend,
    detail: last ? `${last.delta >= 0 ? '+' : ''}${last.delta} µm vs baseline, ${slope >= 0 ? '+' : ''}${slope} µm per 30 days` : 'No in-flight OCT yet',
  });

  const score = Math.round(clamp(factors.reduce((t, f) => t + f.contribution, 0), 0, 100));
  return { score, level: levelOf(score), factors, disclaimer: protocol.risk.disclaimer };
}
