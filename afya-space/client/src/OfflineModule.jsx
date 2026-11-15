import { useState } from 'react';
import Icon from './Icon.jsx';

const STEPS = [
  'Arrêter l’exercice en cours',
  'Immobiliser le bras au repos',
  'Appliquer une poche froide, 15 min',
  'Réévaluer la douleur dans 2 h',
];

export default function OfflineModule() {
  const [done, setDone] = useState(2);
  const [alerted, setAlerted] = useState(false);

  return (
    <div className="card">
      <div className="card-head">
        <h2 className="title">Assistant médical</h2>
        <span className="pill warn"><Icon name="wifioff" size={14} /> Hors ligne</span>
      </div>
      <p className="muted">Liaison avec la Terre : délai estimé 22 min</p>

      <div className="box">
        <p className="muted">Symptôme signalé</p>
        <p>Douleur à l’épaule après un exercice, mobilité réduite.</p>
      </div>

      <div className="box protocol">
        <p className="blue"><strong>Protocole : blessure musculaire légère</strong></p>
        <ul className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < done ? 'done' : ''}>
              <span className={i < done ? 'ok' : 'muted'}><Icon name={i < done ? 'check' : 'circle'} size={20} /></span>
              {s}
            </li>
          ))}
        </ul>
      </div>

      <div className="btn-row two">
        <button className="btn big" disabled={done >= STEPS.length} onClick={() => setDone((d) => Math.min(d + 1, STEPS.length))}>
          {done >= STEPS.length ? 'Protocole terminé' : 'Étape suivante'}
        </button>
        <button className={`btn big ${alerted ? 'okbtn' : ''}`} onClick={() => setAlerted(true)}>
          {alerted ? 'Équipage alerté' : 'Alerter l’équipage'}
        </button>
      </div>

      <p className="muted small">Rapport en file d’attente, envoi dès le retour de la liaison.</p>
    </div>
  );
}