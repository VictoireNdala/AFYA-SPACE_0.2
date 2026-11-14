import { LineChart, Line, XAxis, YAxis, ReferenceArea, ReferenceLine, ResponsiveContainer } from 'recharts';
import Icon from './Icon.jsx';

// Valeurs fictives de variabilité du rythme cardiaque (ms) sur 30 jours.
const VALUES = [52, 54, 51, 53, 52, 55, 53, 51, 52, 54, 53, 52, 55, 54, 52, 53, 51, 52, 54, 53, 52, 51, 50, 47, 42, 39, 37, 36, 35.5, 35];
const DATA = VALUES.map((v, i) => ({ day: i + 1, hrv: v }));
const FLAGGED = [24, 25, 26]; // index des points signalés (jours 25 à 27)

export default function TrendsModule() {
  return (
    <div className="card">
      <h2 className="title">Analyse des tendances</h2>
      <p className="muted">Variabilité du rythme cardiaque, 30 jours</p>

      <p className="muted small zone-label">Zone normale (apprise)</p>
      <div className="spark tall">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={DATA} margin={{ top: 8, right: 8, left: 8, bottom: 24 }}>
            <YAxis hide domain={[28, 62]} />
            <XAxis dataKey="day" hide />
            <ReferenceArea y1={46} y2={58} fill="#1c3552" fillOpacity={0.8} />
            <ReferenceLine x={24} stroke="#777" strokeDasharray="3 3" label={{ value: 'Jour 24', position: 'bottom', fill: '#b3b3b3', fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="hrv"
              stroke="#4a9eff"
              strokeWidth={2}
              isAnimationActive={false}
              activeDot={false}
              dot={(p) =>
                FLAGGED.includes(p.index)
                  ? <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={4} fill="#ff5d5d" />
                  : <g key={`d${p.index}`} />
              }
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="banner crit stack">
        <span className="banner-title"><Icon name="alert" size={18} /> Écart détecté</span>
        <p>Récupération en baisse de 32 % sur 4 jours. Fatigue probable.</p>
      </div>

      <div className="score-row">
        <span className="muted">Score d’anomalie</span>
        <strong>0,87 / 1</strong>
      </div>
    </div>
  );
}