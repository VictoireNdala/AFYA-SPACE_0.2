import { useState } from 'react';
import Icon from './Icon.jsx';

const MOODS = [
  ['Bas', 'sad', 1],
  ['Moyen', 'meh', 2.5],
  ['Bien', 'smile', 3.6],
  ['Top', 'laugh', 4],
];
const WEEK = [4, 3.8, 2.5, 1.5, 2.5, 3.6]; // valeurs fictives des 6 jours précédents

const barClass = (v) => (v >= 3 ? 'ok' : v >= 2 ? 'warn' : 'crit');

export default function MoodModule() {
  const [mood, setMood] = useState('Bien');
  const [stress, setStress] = useState(4);

  const today = (MOODS.find((m) => m[0] === mood) || MOODS[2])[2];
  const bars = [...WEEK, today];

  let suggestion = 'un dîner d’équipe ce soir pourrait aider la cohésion.';
  if (mood === 'Bas' || stress >= 7) suggestion = 'un échange avec le médecin de bord ou une pause pourrait aider.';
  else if (mood === 'Moyen' || stress >= 5) suggestion = 'une courte activité d’équipe pourrait remonter le moral.';

  return (
    <div className="card">
      <h2 className="title">Check-in du jour</h2>
      <p className="muted">Comment vous sentez-vous ?</p>

      <div className="moods">
        {MOODS.map(([label, icon]) => (
          <button key={label} className={`mood ${mood === label ? 'sel' : ''}`} onClick={() => setMood(label)}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="slider">
        <span className="muted">Stress</span>
        <input type="range" min="0" max="10" step="1" value={stress} onChange={(e) => setStress(Number(e.target.value))} aria-label="Niveau de stress" />
        <strong className="right">{stress}</strong>
      </div>

      <p className="muted small">Humeur de l’équipe, 7 derniers jours</p>
      <div className="week">
        {bars.map((v, i) => (
          <span key={i} className={barClass(v)} style={{ height: `${(v / 4) * 100}%` }} />
        ))}
      </div>

      <div className="banner neutral">
        <Icon name="bulb" size={18} />
        <p>Suggestion : {suggestion}</p>
      </div>
    </div>
  );
}