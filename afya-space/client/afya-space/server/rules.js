// Moteur de règles explicables, avec base de référence personnelle par astronaute.
const high = (v, warn, crit) => (v >= crit ? 2 : v >= warn ? 1 : 0);
const low = (v, warn, crit) => (v <= crit ? 2 : v <= warn ? 1 : 0);

export function evaluate(a) {
  const v = a.vitals;
  const b = a.baseline;
  const exercising = a.activity === 'exercice';
  const hrDelta = v.hr - b.hr;

  const checks = [
    {
      metric: 'hr',
      label: 'Rythme cardiaque',
      level: Math.max(exercising ? high(hrDelta, 70, 100) : high(hrDelta, 20, 40), low(v.hr, 50, 40)),
      message: `${v.hr} bpm (référence personnelle : ${b.hr} bpm${exercising ? ', en exercice' : ''})`,
      action: 'Vérifier l’activité en cours, faire une pause et recontrôler dans 5 minutes.',
    },
    {
      metric: 'spo2',
      label: 'Saturation en oxygène',
      level: low(v.spo2, 95, 92),
      message: `SpO₂ à ${v.spo2} %`,
      action: 'Contrôler la qualité de l’air du module et l’équipement d’oxygène.',
    },
    {
      metric: 'temp',
      label: 'Température corporelle',
      level: high(v.temp, 37.8, 38.5),
      message: `${v.temp} °C`,
      action: 'Hydratation, repos et suivi rapproché ; contacter le médecin de bord.',
    },
    {
      metric: 'sleep',
      label: 'Sommeil',
      level: low(v.sleep, 6, 5),
      message: `${v.sleep} h de sommeil`,
      action: 'Adapter le planning de la journée et protéger la prochaine période de repos.',
    },
    {
      metric: 'stress',
      label: 'Niveau de stress',
      level: high(v.stress, 70, 85),
      message: `Stress estimé à ${v.stress}/100`,
      action: 'Proposer une pause, un échange avec l’équipe ou une session de relaxation.',
    },
    {
      metric: 'radiation',
      label: 'Radiation',
      level: high(v.radiation, 100, 250),
      message: `${v.radiation} µSv/h`,
      action: 'Rejoindre la zone la mieux protégée du vaisseau et suivre la procédure radiation.',
    },
  ];

  const level = Math.max(...checks.map((c) => c.level));
  const score = checks.reduce((sum, c) => sum + (c.level === 2 ? 3 : c.level), 0);
  return { level, score, checks };
}