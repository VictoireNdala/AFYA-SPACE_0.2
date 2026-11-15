import { useState } from 'react';
import useStream from './useStream.js';
import CrewModule from './CrewModule.jsx';
import TrendsModule from './TrendsModule.jsx';
import ExerciseModule from './ExerciseModule.jsx';
import MoodModule from './MoodModule.jsx';
import OfflineModule from './OfflineModule.jsx';
import TwinModule from './TwinModule.jsx';
import VoiceAssistant from './VoiceAssistant.jsx';

const TABS = [
  ['crew', 'Équipage'],
  ['trends', 'Tendances'],
  ['exercise', 'Exercice'],
  ['mood', 'Moral'],
  ['offline', 'Hors ligne'],
  ['twin', 'Jumeau'],
];

export default function App() {
  const { crew, alerts, connected, history } = useStream();
  const [tab, setTab] = useState('crew');

  return (
    <div className="app">
      <header className="top">
        <img src="/logo.jpg" alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
        <div>
          <h1>AFYA SPACE</h1>
          <p>Santé de l’équipage en mission longue durée</p>
        </div>
        <span className={`conn ${connected ? 'on' : 'off'}`}>{connected ? 'Connecté' : 'Hors ligne'}</span>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </nav>

      {tab === 'crew' && <CrewModule crew={crew} history={history} alerts={alerts} />}
      {tab === 'trends' && <TrendsModule />}
      {tab === 'exercise' && <ExerciseModule />}
      {tab === 'mood' && <MoodModule />}
      {tab === 'offline' && <OfflineModule />}
      {tab === 'twin' && <TwinModule />}

      <footer>Données simulées – prototype de démonstration, pas un dispositif médical.</footer>
      <VoiceAssistant crew={crew} alerts={alerts} />
    </div>
  );
}