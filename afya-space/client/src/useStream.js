import { useEffect, useState } from 'react';
import { createDemoEngine } from './demoEngine.js';

export const API = 'http://localhost:3001';
const WS_URL = 'ws://localhost:3001/stream';
const MAX_POINTS = 60;

// Mode démo (site en ligne, GitHub Pages) : la simulation tourne dans le navigateur, sans serveur.
export const DEMO = import.meta.env.VITE_DEMO === '1';
let demoEngine = null;

export function triggerScenario(name, targetId) {
  if (DEMO) return Promise.resolve(demoEngine ? demoEngine.trigger(name, targetId) : false);
  return fetch(`${API}/api/scenario/${name}?target=${targetId}`, { method: 'POST' }).catch(() => {});
}

export default function useStream() {
  const [crew, setCrew] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [history, setHistory] = useState({});

  useEffect(() => {
    const pushTick = (ts, list) => {
      setCrew(list);
      setHistory((h) => {
        const next = { ...h };
        for (const a of list) {
          const prev = next[a.id] || [];
          next[a.id] = [...prev, { t: ts, ...a.vitals }].slice(-MAX_POINTS);
        }
        return next;
      });
    };

    if (DEMO) {
      demoEngine = createDemoEngine({
        onTick: pushTick,
        onAlert: (alert) => setAlerts((prev) => [alert, ...prev].slice(0, 50)),
      });
      setConnected(true);
      demoEngine.start();
      return () => {
        demoEngine.stop();
        demoEngine = null;
      };
    }

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
        if (m.type === 'tick') pushTick(m.ts, m.crew);
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
