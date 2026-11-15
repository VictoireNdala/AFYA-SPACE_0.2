import { useState } from 'react';
import Icon from './Icon.jsx';

const INITIAL = [
  { id: 'tapis', title: 'Tapis roulant avec harnais', duration: '30 min', done: true },
  { id: 'resistance', title: 'Résistance (squats, presse)', duration: '45 min', done: false },
  { id: 'velo', title: 'Vélo ergomètre', duration: '30 min', when: '18 h 00', done: false },
];

export default function ExerciseModule() {
  const [items, setItems] = useState(INITIAL);
  const doneCount = items.filter((i) => i.done).length;
  const firstTodo = (items.find((i) => !i.done) || {}).id;

  // Estimations fictives pour la démonstration.
  const muscle = 92 + 2 * doneCount;
  const bone = 87 + doneCount;

  const toggle = (id) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));

  return (
    <div className="card">
      <h2 className="title">Programme du jour</h2>

      <div className="rows">
        {items.map((i) => {
          const current = i.id === firstTodo;
          const icon = i.done ? 'check' : current ? 'play' : 'clock';
          const sub = i.done ? `${i.duration}, terminé` : i.when ? `${i.duration}, ${i.when}` : `${i.duration}, à faire`;
          return (
            <button key={i.id} className={`row ${current ? 'current' : ''}`} onClick={() => toggle(i.id)}>
              <span className={`row-icon ${i.done ? 'ok' : current ? 'blue' : 'muted'}`}><Icon name={icon} size={20} /></span>
              <span>
                <strong>{i.title}</strong>
                <span className="muted small block">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>

      <p className="muted small">Estimation cette semaine</p>
      <div className="meter">
        <div className="meter-head"><span>Masse musculaire</span><strong>{muscle} %</strong></div>
        <div className="bar"><span style={{ width: `${muscle}%`, background: muscle >= 90 ? '#1fa971' : '#c98a14' }} /></div>
      </div>
      <div className="meter">
        <div className="meter-head"><span>Densité osseuse</span><strong>{bone} %</strong></div>
        <div className="bar"><span style={{ width: `${bone}%`, background: bone >= 90 ? '#1fa971' : '#c98a14' }} /></div>
      </div>

      <p className="muted small">Recommandation : ajouter une séance de charge cette semaine.</p>
    </div>
  );
}