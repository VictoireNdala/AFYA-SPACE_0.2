function W($p, $c) {
  $d = Split-Path $p
  if ($d) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
  [System.IO.File]::WriteAllText((Join-Path (Get-Location) $p), $c, (New-Object System.Text.UTF8Encoding $false))
}

# ---------------- SERVER ----------------
W 'afya-space/server/package.json' @'
{
  "name": "afya-space-server",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.19.2",
    "ws": "^8.18.0"
  }
}
'@

W 'afya-space/server/simulator.js' @'
// Simulateur de capteurs : données SIMULÉES (pas de vraies données médicales).
const CREW = [
  { id: 'a1', name: 'Cdr. Amara', role: 'Commandante', baseline: { hr: 62, spo2: 98, temp: 36.6, sleep: 7.2, stress: 25, radiation: 30 } },
  { id: 'a2', name: 'Pilote Kenji', role: 'Pilote', baseline: { hr: 66, spo2: 98, temp: 36.7, sleep: 6.8, stress: 30, radiation: 30 } },
  { id: 'a3', name: 'Dr. Lucia', role: 'Médecin de bord', baseline: { hr: 60, spo2: 99, temp: 36.5, sleep: 7.5, stress: 20, radiation: 30 } },
];

const SCENARIOS = {
  exercice: { activity: 'exercice', effects: { hr: 75 }, duration: 30 },
  hypoxie: { effects: { spo2: -7, hr: 15 }, duration: 25 },
  radiation: { effects: { radiation: 300 }, duration: 25 },
  fatigue: { effects: { sleep: -3, stress: 50, hr: 8 }, duration: 40 },
  fievre: { effects: { temp: 2, hr: 20 }, duration: 40 },
};

const noise = (s) => (Math.random() - 0.5) * 2 * s;
const NOISE = { hr: 1.5, spo2: 0.3, temp: 0.03, sleep: 0, stress: 1.5, radiation: 2 };
const DECIMALS = { hr: 0, spo2: 0, temp: 1, sleep: 1, stress: 0, radiation: 0 };

export function createSimulator() {
  const state = CREW.map((c) => ({
    ...c,
    values: { ...c.baseline },
    active: [],
    hist: [],
  }));

  function tick() {
    return state.map((s) => {
      const target = { ...s.baseline };
      let activity = 'repos';
      for (const sc of s.active) {
        const def = SCENARIOS[sc.name];
        if (def.activity) activity = def.activity;
        for (const [k, v] of Object.entries(def.effects)) target[k] += v;
      }
      for (const k of Object.keys(target)) {
        s.values[k] += (target[k] - s.values[k]) * 0.3 + noise(NOISE[k]);
      }
      s.active = s.active
        .map((sc) => ({ ...sc, ticksLeft: sc.ticksLeft - 1 }))
        .filter((sc) => sc.ticksLeft > 0);

      const vitals = {};
      for (const k of Object.keys(s.values)) {
        vitals[k] = Number(s.values[k].toFixed(DECIMALS[k]));
      }
      s.hist.push(vitals);
      if (s.hist.length > 120) s.hist.shift();
      return { id: s.id, name: s.name, role: s.role, activity, vitals, baseline: s.baseline };
    });
  }

  function trigger(name, targetId) {
    const def = SCENARIOS[name];
    if (!def) return false;
    const s = state.find((x) => x.id === targetId) || state[0];
    s.active.push({ name, ticksLeft: def.duration });
    return true;
  }

  const history = (id) => (state.find((x) => x.id === id) || { hist: [] }).hist;

  return { tick, trigger, history };
}
'@

W 'afya-space/server/rules.js' @'
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
'@

W 'afya-space/server/index.js' @'
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createSimulator } from './simulator.js';
import { evaluate } from './rules.js';

const app = express();
app.use(cors());
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

const sim = createSimulator();
const alertLog = [];
const lastLevels = new Map();

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/alerts', (_req, res) => res.json(alertLog.slice(-100)));
app.post('/api/scenario/:name', (req, res) => {
  const ok = sim.trigger(req.params.name, req.query.target);
  res.status(ok ? 200 : 400).json({ ok });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', alerts: alertLog.slice(-50) }));
});

setInterval(() => {
  const ts = Date.now();
  const crew = sim.tick().map((a) => {
    const status = evaluate(a);
    for (const c of status.checks) {
      const key = `${a.id}:${c.metric}`;
      const prev = lastLevels.get(key) ?? 0;
      if (c.level !== prev) {
        lastLevels.set(key, c.level);
        const entry = {
          ts,
          astronautId: a.id,
          astronaut: a.name,
          metric: c.metric,
          label: c.label,
          level: c.level,
          message: c.level ? c.message : 'Retour à la normale',
          action: c.level ? c.action : '',
        };
        alertLog.push(entry);
        if (alertLog.length > 500) alertLog.shift();
        broadcast({ type: 'alert', alert: entry });
      }
    }
    return {
      ...a,
      status: { level: status.level, score: status.score, alerts: status.checks.filter((c) => c.level > 0) },
    };
  });
  broadcast({ type: 'tick', ts, crew });
}, 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Afya Space server : http://localhost:${PORT}`));
'@

# ---------------- CLIENT ----------------
W 'afya-space/client/package.json' @'
{
  "name": "afya-space-client",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "recharts": "^2.12.7"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "vite": "^5.4.2"
  }
}
'@

W 'afya-space/client/vite.config.js' @'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()] });
'@

W 'afya-space/client/index.html' @'
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Afya Space – Surveillance santé équipage</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
'@

W 'afya-space/client/src/main.jsx' @'
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

createRoot(document.getElementById('root')).render(<App />);
'@

W 'afya-space/client/src/Icon.jsx' @'
const PATHS = {
  heart: (<><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" /><path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" /></>),
  drop: (<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z" />),
  thermo: (<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />),
  moon: (<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />),
  alert: (<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
  check: (<><circle cx="12" cy="12" r="10" /><path d="m9 12 2 2 4-4" /></>),
  play: (<polygon points="6 3 20 12 6 21 6 3" />),
  clock: (<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  circle: (<circle cx="12" cy="12" r="10" />),
  bulb: (<><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" /><path d="M9 18h6" /><path d="M10 22h4" /></>),
  sad: (<><circle cx="12" cy="12" r="10" /><path d="M16 16s-1.5-2-4-2-4 2-4 2" /><path d="M9 9h.01" /><path d="M15 9h.01" /></>),
  meh: (<><circle cx="12" cy="12" r="10" /><line x1="8" x2="16" y1="15" y2="15" /><path d="M9 9h.01" /><path d="M15 9h.01" /></>),
  smile: (<><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2" /><path d="M9 9h.01" /><path d="M15 9h.01" /></>),
  laugh: (<><circle cx="12" cy="12" r="10" /><path d="M18 13a6 6 0 0 1-6 5 6 6 0 0 1-6-5h12Z" /><line x1="9" x2="9.01" y1="9" y2="9" /><line x1="15" x2="15.01" y1="9" y2="9" /></>),
  wifioff: (<><path d="M12 20h.01" /><path d="M8.5 16.429a5 5 0 0 1 7 0" /><path d="M5 12.859a10 10 0 0 1 5.17-2.69" /><path d="M19 12.859a10 10 0 0 0-2.007-1.523" /><path d="M2 8.82a15 15 0 0 1 4.177-2.643" /><path d="M22 8.82a15 15 0 0 0-11.288-3.764" /><path d="m2 2 20 20" /></>),
};

export default function Icon({ name, size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
'@

W 'afya-space/client/src/useStream.js' @'
import { useEffect, useState } from 'react';

export const API = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/stream';
const MAX_POINTS = 60;

export default function useStream() {
  const [crew, setCrew] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState({});

  useEffect(() => {
    let ws;
    let timer;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'init') setAlerts(m.alerts.slice().reverse());
        if (m.type === 'alert') setAlerts((prev) => [m.alert, ...prev].slice(0, 50));
        if (m.type === 'tick') {
          setCrew(m.crew);
          setHistory((h) => {
            const next = { ...h };
            for (const a of m.crew) {
              const prev = next[a.id] || [];
              next[a.id] = [...prev, { t: m.ts, ...a.vitals }].slice(-MAX_POINTS);
            }
            return next;
          });
        }
      };
    };

    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      if (ws) ws.close();
    };
  }, []);

  return { crew, alerts, connected, history };
}
'@

W 'afya-space/client/src/CrewModule.jsx' @'
import { useState } from 'react';
import { LineChart, Line, YAxis, ResponsiveContainer } from 'recharts';
import Icon from './Icon.jsx';
import { API } from './useStream.js';

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

  const trigger = (name) =>
    fetch(`${API}/api/scenario/${name}?target=${a.id}`, { method: 'POST' }).catch(() => {});

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
'@

W 'afya-space/client/src/TrendsModule.jsx' @'
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
'@

W 'afya-space/client/src/ExerciseModule.jsx' @'
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
'@

W 'afya-space/client/src/MoodModule.jsx' @'
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
'@

W 'afya-space/client/src/OfflineModule.jsx' @'
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
'@

W 'afya-space/client/src/TwinModule.jsx' @'
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
'@

W 'afya-space/client/src/App.jsx' @'
import { useState } from 'react';
import useStream from './useStream.js';
import CrewModule from './CrewModule.jsx';
import TrendsModule from './TrendsModule.jsx';
import ExerciseModule from './ExerciseModule.jsx';
import MoodModule from './MoodModule.jsx';
import OfflineModule from './OfflineModule.jsx';
import TwinModule from './TwinModule.jsx';

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
    </div>
  );
}
'@

W 'afya-space/client/src/styles.css' @'
:root {
  --bg: #161616;
  --card: #1e1e1e;
  --tile: #141414;
  --line: #2e2e2e;
  --text: #f4f4f4;
  --muted: #b3b3b3;
  --ok: #3ddc84;
  --ok-bg: #0f2f1d;
  --warn: #f5a524;
  --warn-bg: #3a2200;
  --crit: #ff6b6b;
  --crit-bg: #3b0d0d;
  --blue: #6aa9ff;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, "Segoe UI", Roboto, sans-serif; }
button { font: inherit; color: inherit; }
p { margin: 4px 0; }
.app { max-width: 640px; margin: 0 auto; padding: 16px 14px 32px; }

.top { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.top img { width: 44px; height: 44px; border-radius: 10px; }
.top h1 { font-size: 1.1rem; margin: 0; letter-spacing: 0.12em; }
.top p { margin: 2px 0 0; font-size: 0.8rem; color: var(--muted); }
.conn { margin-left: auto; font-size: 0.8rem; padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); white-space: nowrap; }
.conn.on { color: var(--ok); }
.conn.off { color: var(--crit); }

.tabs { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 14px; }
.tab { flex: 0 0 auto; background: transparent; border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px; cursor: pointer; color: var(--muted); }
.tab.active { background: #fff; color: #111; border-color: #fff; }

.pills { display: flex; gap: 8px; overflow-x: auto; margin-bottom: 12px; }
.chip { flex: 0 0 auto; background: var(--card); border: 1px solid var(--line); border-radius: 999px; padding: 6px 12px; cursor: pointer; font-size: 0.9rem; }
.chip.active { border-color: #3b82f6; color: var(--blue); }

.card { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 18px; margin-bottom: 14px; }
.card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 10px; }
.title { font-size: 1.15rem; margin: 0; }
.subtitle { font-size: 0.95rem; margin: 0 0 10px; color: var(--muted); font-weight: 600; }
.muted { color: var(--muted); }
.small { font-size: 0.85rem; }
.block { display: block; }
.blue { color: var(--blue); }
.right { text-align: right; }
.ok { color: var(--ok); }
.crit { color: var(--crit); }

.pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 12px; border-radius: 999px; font-size: 0.8rem; font-weight: 600; white-space: nowrap; }
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.warn { background: var(--warn-bg); color: var(--warn); }
.pill.crit { background: var(--crit-bg); color: var(--crit); }

.tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 12px 0; }
.tile { background: var(--tile); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.tile-label { display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 0.9rem; }
.tile-value { font-size: 1.8rem; font-weight: 600; }
.tile-value small { font-size: 0.9rem; color: var(--muted); font-weight: 400; }
.tile.warn { background: var(--warn-bg); }
.tile.warn .tile-label, .tile.warn .tile-value, .tile.warn small { color: var(--warn); }
.tile.crit { background: var(--crit-bg); }
.tile.crit .tile-label, .tile.crit .tile-value, .tile.crit small { color: var(--crit); }
.tile.ok .tile-label { color: var(--muted); }

.chart-title { margin-top: 14px; font-size: 0.9rem; }
.spark { height: 80px; }
.spark.tall { height: 170px; }
.zone-label { margin-top: 14px; }

.banner { display: flex; gap: 10px; align-items: flex-start; border-radius: 12px; padding: 12px 14px; margin-top: 12px; }
.banner p { margin: 0; line-height: 1.4; }
.banner.warn { background: var(--warn-bg); color: var(--warn); }
.banner.crit { background: var(--crit-bg); color: var(--crit); }
.banner.neutral, .banner.ok { background: var(--tile); color: var(--muted); }
.banner.stack { flex-direction: column; gap: 4px; }
.banner-title { display: flex; align-items: center; gap: 8px; font-weight: 600; }

.score-row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }

.btn-row { display: flex; gap: 8px; }
.btn-row.wrap { flex-wrap: wrap; }
.btn-row.two { display: grid; grid-template-columns: 1fr 1fr; margin: 12px 0; }
.btn { background: var(--tile); border: 1px solid var(--line); border-radius: 10px; padding: 8px 12px; cursor: pointer; }
.btn:hover:not(:disabled) { border-color: var(--warn); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.big { padding: 16px 10px; border-radius: 12px; text-align: center; }
.btn.okbtn { border-color: var(--ok); color: var(--ok); }

.log { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.log li { display: flex; align-items: center; gap: 10px; font-size: 0.9rem; }
.log-text { flex: 1; }
.log time { color: var(--muted); font-size: 0.8rem; }

.rows { display: flex; flex-direction: column; gap: 8px; margin: 12px 0 16px; }
.row { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; background: var(--tile); border: 1px solid var(--line); border-radius: 12px; padding: 14px; cursor: pointer; }
.row.current { border-color: #27508f; background: #0f1a2b; }
.row-icon { display: flex; }
.row-icon.blue { color: var(--blue); }
.row-icon.muted { color: var(--muted); }

.meter { margin: 10px 0; }
.meter-head { display: flex; justify-content: space-between; margin-bottom: 6px; }
.bar { height: 6px; background: #2a2a2a; border-radius: 999px; overflow: hidden; }
.bar span { display: block; height: 100%; border-radius: 999px; transition: width 0.3s; }

.moods { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0; }
.mood { background: var(--tile); border: 1px solid var(--line); border-radius: 12px; padding: 12px 6px; display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
.mood.sel { border-color: #3b82f6; background: #0b1f3f; color: var(--blue); }

.slider { display: grid; grid-template-columns: 72px 1fr 78px; gap: 10px; align-items: center; margin: 10px 0; }
input[type=range] { width: 100%; accent-color: #cfcfcf; }

.week { display: flex; align-items: flex-end; gap: 10px; height: 90px; margin: 10px 0 14px; }
.week span { flex: 1; border-radius: 4px; }
.week .ok { background: #1fa971; }
.week .warn { background: #c98a14; }
.week .crit { background: #d94b4b; }

.box { background: var(--tile); border-radius: 12px; padding: 12px 14px; margin: 12px 0; }
.box.protocol { border: 1px solid #27508f; }
.steps { list-style: none; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.steps li { display: flex; align-items: center; gap: 10px; }
.steps span { display: flex; }

.legend { display: flex; gap: 16px; font-size: 0.8rem; margin: 4px 0 8px; }
.legend .ok { color: #2ecc8f; }
.legend .crit { color: #e5534b; }

footer { margin-top: 18px; text-align: center; color: var(--muted); font-size: 0.8rem; }
'@

Write-Host "Projet afya-space créé." -ForegroundColor Green