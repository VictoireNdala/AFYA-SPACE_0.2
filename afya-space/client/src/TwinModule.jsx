import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer } from 'recharts';

// Modèle simplifié et FICTIF, uniquement pour la démonstration.
const density = (day, hoursPerWeek) => 100 * (1 - 0.0003 * day * Math.max(0.04, 1 - 0.08 * hoursPerWeek));

export default function TwinModule() {
  const [mission, setMission] = useState(540);
  const [exercise, setExercise] = useState(6);

  const data = [];
  for (let d = 0; d <= 900; d += 30) {
    data.push({ d, avec: density(d, exercise), sans: density(d, 0) });
  }

  const est = Math.round(density(mission, exercise));
  const risk = est >= 94 ? ['Faible', 'ok'] : est >= 85 ? ['Modéré', 'warn'] : ['Élevé', 'crit'];

  return (
    <div className="card">
      <h2 className="title">Jumeau numérique</h2>
      <p className="muted">Projection de la densité osseuse</p>

      <div className="slider">
        <span className="muted">Mission</span>
        <input type="range" min="0" max="900" step="10" value={mission} onChange={(e) => setMission(Number(e.target.value))} aria-label="Durée de mission en jours" />
        <strong className="right">{mission} j</strong>
      </div>
      <div className="slider">
        <span className="muted">Exercice</span>
        <input type="range" min="0" max="14" step="1" value={exercise} onChange={(e) => setExercise(Number(e.target.value))} aria-label="Heures d’exercice par semaine" />
        <strong className="right">{exercise} h/sem</strong>
      </div>

      <div className="spark tall">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <XAxis type="number" dataKey="d" domain={[0, 900]} ticks={[0, 900]} tickFormatter={(d) => `Jour ${d}`} stroke="#777" tick={{ fill: '#b3b3b3', fontSize: 12 }} />
            <YAxis domain={[60, 100]} ticks={[100]} width={36} stroke="#777" tick={{ fill: '#b3b3b3', fontSize: 12 }} />
            <ReferenceLine x={mission} stroke="#888" strokeDasharray="3 3" />
            <Line type="monotone" dataKey="avec" stroke="#2ecc8f" strokeWidth={2} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="sans" stroke="#e5534b" strokeWidth={2} strokeDasharray="5 4" dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="legend">
        <span className="ok">— Avec exercice</span>
        <span className="crit">- - Sans exercice</span>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-label">Densité estimée</span>
          <span className="tile-value">{est} %</span>
        </div>
        <div className={`tile ${risk[1]}`}>
          <span className="tile-label">Risque</span>
          <span className="tile-value">{risk[0]}</span>
        </div>
      </div>
    </div>
  );
}