import { useState } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import Icon from './Icon.jsx';
import { triggerScenario } from './useStream.js';

const PROFILE = {
  a1: { name: 'Cmdt. Amara Diallo', day: 142 },
  a2: { name: 'Pilote Kenji Mori', day: 142 },
  a3: { name: 'Dr Lucia Alvarez', day: 142 },
};
const CLS = ['ok', 'warn', 'crit'];
const STATUS_LABEL = ['Stable', 'Attention', 'Critique'];
const SCENARIOS = [
  ['exercice', 'Exercice physique'],
  ['hypoxie', 'Baisse de SpO₂'],
  ['radiation', 'Pic de radiation'],
  ['fatigue', 'Fatigue / stress'],
  ['fievre', 'Fièvre'],
];

function fmtSleep(h) {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return `${hh} h ${String(mm).padStart(2, '0')}`;
}

export default function CrewModule({ crew, history, alerts }) {
  const [selectedId, setSelectedId] = useState('a1');
  const a = crew.find((x) => x.id === selectedId) || crew[0];

  if (!a) {
    return (
      <div className="card">
        <p className="muted">En attente des données du serveur…</p>
      </div>
    );
  }

  const prof = PROFILE[a.id] || { name: a.name, day: 1 };
  const lvl = (metric) => {
    const f = a.status.alerts.find((x) => x.metric === metric);
    return f ? f.level : 0;
  };
  const top = [...a.status.alerts].sort((x, y) => y.level - x.level)[0];
  const data = history[a.id] || [];
  const maxIdx = data.reduce((best, p, i) => (p.hr > (data[best] ? data[best].hr : -Infinity) ? i : best), 0);

  const tiles = [
    ['hr', 'heart', 'Rythme cardiaque', String(a.vitals.hr), 'bpm'],
    ['spo2', 'drop', 'SpO₂', String(a.vitals.spo2), '%'],
    ['temp', 'thermo', 'Température', String(a.vitals.temp).replace('.', ','), '°C'],
    ['sleep', 'moon', 'Sommeil', fmtSleep(a.vitals.sleep), ''],
  ];

  const trigger = (name) => triggerScenario(name, a.id);

  return (
    <>
      <div className="pills">
        {crew.map((c) => (
          <button key={c.id} className={`chip ${c.id === a.id ? 'active' : ''}`} onClick={() => setSelectedId(c.id)}>
            {(PROFILE[c.id] || { name: c.name }).name}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h2 className="title">{prof.name}</h2>
            <p className="muted">Jour {prof.day} de mission · {a.activity === 'exercice' ? 'en exercice' : 'au repos'}</p>
          </div>
          <span className={`pill ${CLS[a.status.level]}`}>{STATUS_LABEL[a.status.level]}</span>
        </div>

        <div className="tiles">
          {tiles.map(([key, icon, label, value, unit]) => (
            <div key={key} className={`tile ${CLS[lvl(key)]}`}>
              <span className="tile-label"><Icon name={icon} /> {label}</span>
              <span className="tile-value">{value} <small>{unit}</small></span>
            </div>
          ))}
        </div>

        <p className="muted chart-title">Rythme cardiaque, en direct (60 dernières secondes)</p>
        <div className="spark">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <YAxis hide domain={['dataMin - 4', 'dataMax + 4']} />
              <Line
                type="monotone"
                dataKey="hr"
                stroke="#4a9eff"
                strokeWidth={2}
                isAnimationActive={false}
                activeDot={false}
                dot={(p) =>
                  p.index === maxIdx
                    ? <circle key={`d${p.index}`} cx={p.cx} cy={p.cy} r={4} fill="#ff5d5d" />
                    : <g key={`d${p.index}`} />
                }
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={`banner ${top ? CLS[top.level] : 'neutral'}`}>
          <Icon name={top ? 'alert' : 'check'} size={18} />
          <p>{top ? `${top.label} : ${top.message}. ${top.action}` : 'Aucune anomalie détectée sur les dernières mesures.'}</p>
        </div>
      </div>

      <div className="card">
        <h3 className="subtitle">Simuler un événement pour {prof.name}</h3>
        <div className="btn-row wrap">
          {SCENARIOS.map(([name, label]) => (
            <button key={name} className="btn" onClick={() => trigger(name)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="subtitle">Journal d’alertes</h3>
        {alerts.length === 0 && <p className="muted">Aucune alerte pour le moment.</p>}
        <ul className="log">
          {alerts.slice(0, 6).map((al, i) => (
            <li key={`${al.ts}-${al.astronautId}-${al.metric}-${i}`}>
              <span className={`pill ${CLS[al.level]}`}>{STATUS_LABEL[al.level]}</span>
              <span className="log-text">{al.astronaut} · {al.label}</span>
              <time>{new Date(al.ts).toLocaleTimeString('fr-FR')}</time>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}