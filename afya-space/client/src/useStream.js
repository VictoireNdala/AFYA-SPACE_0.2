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