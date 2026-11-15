import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, streamUrl } from './api.js';

// Two contexts on purpose:
//  - AppCtx changes rarely (data revision, mission state, selection, toasts): pages and charts subscribe to it.
//  - StreamCtx changes every second (live vitals, radio link): only small live widgets subscribe to it,
//    so animated charts are not re-rendered by the 1 Hz stream.
const AppCtx = createContext(null);
const StreamCtx = createContext(null);
const HISTORY = 90;

export function LiveProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [rev, setRev] = useState(0);
  const [vitals, setVitals] = useState([]);
  const [history, setHistory] = useState({});
  const [link, setLink] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [state, setState] = useState(null);
  const [selected, setSelectedRaw] = useState(() => localStorage.getItem('sg.selected') || 'AST-003');
  const toastId = useRef(0);

  const setSelected = useCallback((code) => {
    setSelectedRaw(code);
    localStorage.setItem('sg.selected', code);
  }, []);

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  useEffect(() => {
    let ws;
    let timer;
    let closed = false;
    const connect = () => {
      ws = new WebSocket(streamUrl());
      ws.onopen = () => setConnected(true);
      ws.onclose = () => {
        setConnected(false);
        if (!closed) timer = setTimeout(connect, 2000);
      };
      ws.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === 'hello' || m.type === 'rev') setRev(m.rev);
        if (m.type === 'tick') {
          setVitals(m.crew);
          setLink(m.link);
          setHistory((h) => {
            const next = { ...h };
            for (const a of m.crew) next[a.code] = [...(next[a.code] || []), { t: m.ts, ...a.vitals }].slice(-HISTORY);
            return next;
          });
        }
        if (m.type === 'alert' && !m.alert.acked) {
          const id = ++toastId.current;
          setToasts((t) => [{ id, alert: m.alert }, ...t].slice(0, 3));
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 9000);
        }
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
    };
  }, []);

  // Mission state (day, protocol) refreshes on every data revision.
  useEffect(() => {
    api('/state').then(setState).catch(() => {});
  }, [rev]);

  const app = useMemo(() => ({ connected, rev, toasts, dismiss, state, selected, setSelected }), [connected, rev, toasts, dismiss, state, selected, setSelected]);
  const stream = useMemo(() => ({ vitals, history, link }), [vitals, history, link]);
  return (
    <AppCtx.Provider value={app}>
      <StreamCtx.Provider value={stream}>{children}</StreamCtx.Provider>
    </AppCtx.Provider>
  );
}

/** Slow-changing app state (safe for pages with animated charts). */
export const useApp = () => useContext(AppCtx);
/** 1 Hz live stream: vitals, history, radio link. */
export const useStream = () => useContext(StreamCtx);
/** Both (re-renders every second). */
export const useLive = () => ({ ...useContext(AppCtx), ...useContext(StreamCtx) });

/** Fetch JSON and refetch whenever the server data revision changes. Keeps the previous data while loading. */
export function useApi(path) {
  const { rev } = useApp();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!path) return undefined;
    let alive = true;
    api(path)
      .then((d) => alive && (setData(d), setError(null)))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [path, rev, nonce]);
  return { data, error, reload: () => setNonce((n) => n + 1) };
}

/** Poll an endpoint every `ms` (used for the radio link page). */
export function usePoll(path, ms = 1000) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    const run = () => api(path).then((d) => alive && setData(d)).catch(() => {});
    run();
    const id = setInterval(run, ms);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [path, ms]);
  return data;
}
