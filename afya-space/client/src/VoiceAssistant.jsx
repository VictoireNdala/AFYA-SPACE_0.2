import { useEffect, useRef, useState } from 'react';

const LANG_CODE = 'en-US';
const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const NAMES = {
  a1: { spoken: 'Amara', words: ['amara', 'diallo', 'commander'] },
  a2: { spoken: 'Kenji', words: ['kenji', 'mori', 'pilot'] },
  a3: { spoken: 'Lucia', words: ['lucia', 'alvarez', 'doctor', 'physician'] },
};

const METRIC_WORDS = {
  hr: ['heart', 'pulse', 'bpm'],
  spo2: ['oxygen', 'saturation', 'spo2', 'spo 2', 's p o 2'],
  temp: ['temperature', 'fever'],
  sleep: ['sleep', 'slept'],
  stress: ['stress'],
  radiation: ['radiation'],
};

// The server sends French labels and actions: the assistant uses English ones.
const LABEL = {
  hr: 'Heart rate',
  spo2: 'Oxygen saturation',
  temp: 'Body temperature',
  sleep: 'Sleep',
  stress: 'Stress level',
  radiation: 'Radiation',
};
const ACTION = {
  hr: 'Check the current activity, take a break and recheck in 5 minutes.',
  spo2: 'Check the module air quality and the oxygen equipment.',
  temp: 'Hydration, rest and close monitoring; contact the onboard doctor.',
  sleep: 'Adjust the day schedule and protect the next rest period.',
  stress: 'Suggest a break, a team talk or a relaxation session.',
  radiation: 'Move to the best shielded area of the vessel and follow the radiation procedure.',
};
const labelOf = (x) => LABEL[x.metric] || x.label;
const actionOf = (x) => ACTION[x.metric] || x.action;

const hm = (h) => {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return [hh, mm];
};

const LEVEL_WORD = ['stable', 'under watch', 'critical'];

const VALUE = {
  hr: (v) => `heart rate ${v.hr} beats per minute`,
  spo2: (v) => `oxygen saturation ${v.spo2} percent`,
  temp: (v) => `temperature ${String(v.temp).replace('.', ' point ')} degrees`,
  sleep: (v) => {
    const [hh, mm] = hm(v.sleep);
    return mm ? `sleep ${hh} hours ${mm} minutes` : `sleep ${hh} hours`;
  },
  stress: (v) => `stress estimated at ${v.stress} out of 100`,
  radiation: (v) => `radiation ${v.radiation} microsieverts per hour`,
};

const T = {
  title: 'Afya voice assistant',
  hello: 'Hello, I am the Afya voice assistant. Ask me for the crew status.',
  noData: 'I do not have data yet. Check that the server is running.',
  help: 'You can ask me for the crew status, the alerts, or a vital sign: for example Amara\u2019s heart rate, Kenji\u2019s oxygen or Lucia\u2019s sleep.',
  emergency: 'In a real emergency, contact the onboard doctor immediately. This is a demonstration prototype.',
  noAlerts: 'No active alerts. The whole crew is stable.',
  notUnderstood: 'I did not understand. Try: crew status, alerts, or Amara\u2019s heart rate.',
  chips: ['Crew status', 'Alerts', 'Amara\u2019s heart rate', 'Kenji\u2019s oxygen'],
  testPhrase: 'Hello, this is the voice of the Afya assistant.',
  errors: {
    notAllowed: 'Microphone access denied: allow it in the browser.',
    network: 'Speech recognition needs an internet connection (Chrome or Edge).',
    noSpeech: 'I did not hear anything, please try again.',
    other: 'Speech recognition failed. Use the text box.',
  },
  noMic: 'Microphone not available in this browser: use Chrome or Edge, or the text box.',
};

function answer(text, crew) {
  if (!crew.length) return T.noData;
  const t = norm(text);
  const who = crew.filter((a) => (NAMES[a.id] ? NAMES[a.id].words : []).some((w) => t.includes(w)));
  const metric = Object.keys(METRIC_WORDS).find((m) => METRIC_WORDS[m].some((w) => t.includes(w)));
  const spoken = (a) => (NAMES[a.id] ? NAMES[a.id].spoken : a.name);

  if (/emergency|urgent/.test(t)) return T.emergency;
  if (/\bhelp\b|what can you|commands|what do you do/.test(t)) return T.help;
  if (/alert|alarm|problem|anomal|warning|issue/.test(t)) {
    const active = crew
      .flatMap((a) => a.status.alerts.map((x) => ({ a, x })))
      .sort((p, q) => q.x.level - p.x.level);
    if (active.length === 0) return T.noAlerts;
    return active
      .slice(0, 3)
      .map(({ a, x }) => `${spoken(a)}: ${labelOf(x)}, ${x.level === 2 ? 'critical' : 'warning'} level. ${actionOf(x)}`)
      .join(' ');
  }
  if (metric) {
    const list = who.length ? who : crew;
    return list.map((a) => `${spoken(a)}: ${VALUE[metric](a.vitals)}.`).join(' ');
  }
  if (who.length || /status|health|crew|report|how is|how are|situation|everyone|overview/.test(t)) {
    const list = who.length ? who : crew;
    return list
      .map((a) => {
        const base = `${spoken(a)}: ${LEVEL_WORD[a.status.level]}.`;
        const top = [...a.status.alerts].sort((x, y) => y.level - x.level)[0];
        return top ? `${base} Point of attention: ${labelOf(top)}.` : `${base} ${VALUE.hr(a.vitals)}.`;
      })
      .join(' ');
  }
  return T.notUnderstood;
}

// ---------- Speech synthesis ----------
const voiceScore = (v) =>
  (/natural/i.test(v.name) ? 3 : /online/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0) +
  (v.lang.toLowerCase() === LANG_CODE.toLowerCase() ? 0.5 : 0);

function enVoices() {
  if (!HAS_TTS) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith('en'))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

function speak(text, rate, voiceName) {
  if (!HAS_TTS) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = enVoices();
  const voice = voices.find((v) => v.name === voiceName) || voices[0];
  const parts = (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
  parts.forEach((part) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = LANG_CODE;
    u.rate = rate;
    if (voice) u.voice = voice;
    synth.speak(u);
  });
}

const loadPref = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v === null ? d : v;
  } catch {
    return d;
  }
};
const savePref = (k, v) => {
  try {
    localStorage.setItem(k, String(v));
  } catch {
    /* ignore */
  }
};

function MicIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

export default function VoiceAssistant({ crew, alerts }) {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState('');
  const [speakOn, setSpeakOn] = useState(true);
  const [autoAlerts, setAutoAlerts] = useState(true);
  const [rate, setRate] = useState(() => Number(loadPref('afya-voice-rate', 1.2)) || 1.2);
  const [voiceName, setVoiceName] = useState(() => loadPref('afya-voice-name-en', ''));
  const [voices, setVoices] = useState([]);
  const [log, setLog] = useState([{ from: 'bot', text: T.hello }]);

  const recRef = useRef(null);
  const crewRef = useRef(crew);
  const speakRef = useRef(speakOn);
  const autoRef = useRef(autoAlerts);
  const rateRef = useRef(rate);
  const voiceRef = useRef(voiceName);
  const lastTs = useRef(Date.now());
  crewRef.current = crew;
  speakRef.current = speakOn;
  autoRef.current = autoAlerts;
  rateRef.current = rate;
  voiceRef.current = voiceName;

  useEffect(() => {
    if (!HAS_TTS) return undefined;
    const load = () => setVoices(enVoices());
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);

  const say = (text, spokenText) => {
    setLog((l) => [...l, { from: 'bot', text }].slice(-30));
    if (speakRef.current) speak(spokenText || text, rateRef.current, voiceRef.current);
  };

  const handle = (text) => {
    const clean = text.trim();
    if (!clean) return;
    const reply = answer(clean, crewRef.current);
    setLog((l) => [...l, { from: 'me', text: clean }, { from: 'bot', text: reply }].slice(-30));
    if (speakRef.current) speak(reply, rateRef.current, voiceRef.current);
  };
  const handleRef = useRef(handle);
  handleRef.current = handle;

  const toggleMic = () => {
    if (!SR) return;
    if (listening) {
      if (recRef.current) recRef.current.stop();
      return;
    }
    const rec = new SR();
    rec.lang = LANG_CODE;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      const er = T.errors;
      const msgs = { 'not-allowed': er.notAllowed, network: er.network, 'no-speech': er.noSpeech };
      say(msgs[e.error] || er.other);
    };
    rec.onresult = (e) => handleRef.current(e.results[0][0].transcript);
    recRef.current = rec;
    rec.start();
  };

  // Short voice announcement of new critical alerts.
  useEffect(() => {
    if (!alerts.length) return;
    const newest = alerts[0].ts;
    const fresh = alerts.filter((x) => x.ts > lastTs.current && x.level === 2);
    lastTs.current = Math.max(lastTs.current, newest);
    if (!autoRef.current || fresh.length === 0) return;
    const nameOf = (x) => (NAMES[x.astronautId] ? NAMES[x.astronautId].spoken : x.astronaut);
    const shown = fresh
      .slice(0, 2)
      .map((x) => `Critical alert for ${nameOf(x)}: ${labelOf(x)}. ${actionOf(x)}`)
      .join(' ');
    const short = fresh
      .slice(0, 2)
      .map((x) => `Critical alert for ${nameOf(x)}: ${labelOf(x)}.`)
      .join(' ');
    say(shown, short);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alerts]);

  const send = (e) => {
    e.preventDefault();
    handle(input);
    setInput('');
  };

  const changeRate = (v) => {
    setRate(v);
    savePref('afya-voice-rate', v);
  };
  const changeVoice = (v) => {
    setVoiceName(v);
    savePref('afya-voice-name-en', v);
  };
  const testVoice = () => speak(T.testPhrase, rateRef.current, voiceRef.current);

  return (
    <>
      {open && (
        <div className="voice-panel" role="dialog" aria-label={T.title}>
          <strong>{T.title}</strong>

          <div className="voice-opts">
            <label><input type="checkbox" checked={speakOn} onChange={(e) => setSpeakOn(e.target.checked)} /> Voice replies</label>
            <label><input type="checkbox" checked={autoAlerts} onChange={(e) => setAutoAlerts(e.target.checked)} /> Voice alerts</label>
          </div>

          {HAS_TTS && (
            <div className="voice-set">
              <span>Speed</span>
              <input type="range" min="0.8" max="1.6" step="0.05" value={rate} onChange={(e) => changeRate(Number(e.target.value))} aria-label="Voice speed" />
              <span>{rate.toFixed(2)}x</span>
              <span>Voice</span>
              <select value={voiceName} onChange={(e) => changeVoice(e.target.value)} aria-label="Voice choice">
                <option value="">Automatic (most natural)</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              <button type="button" className="btn" onClick={testVoice}>Test</button>
            </div>
          )}

          <div className="voice-log">
            {log.map((m, i) => (
              <div key={i} className={`msg ${m.from}`}>{m.text}</div>
            ))}
          </div>

          <div className="voice-chips">
            {T.chips.map((c) => (
              <button key={c} className="btn" onClick={() => handle(c)}>{c}</button>
            ))}
          </div>

          <form className="voice-input" onSubmit={send}>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={'Type or speak\u2026'} aria-label="Command" />
            <button type="submit" className="btn">Send</button>
          </form>
          {!SR && <p className="muted small">{T.noMic}</p>}
        </div>
      )}

      <button
        className={`voice-fab ${listening ? 'live' : ''}`}
        onClick={() => { if (!open) { setOpen(true); } else if (SR) { toggleMic(); } else { setOpen(false); } }}
        aria-label={listening ? 'Stop listening' : 'Voice assistant'}
        title={open ? 'Speak' : 'Open the voice assistant'}
      >
        <MicIcon />
      </button>
      {open && <button className="voice-close" onClick={() => setOpen(false)}>Close</button>}
    </>
  );
}