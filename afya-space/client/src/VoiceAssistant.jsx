import { useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const NAMES = {
  a1: { spoken: 'Amara', words: ['amara', 'diallo', 'commandant', 'commandante'] },
  a2: { spoken: 'Kenji', words: ['kenji', 'mori', 'pilote'] },
  a3: { spoken: 'Lucia', words: ['lucia', 'alvarez', 'docteur', 'medecin'] },
};

const METRIC_WORDS = {
  hr: ['rythme', 'cardiaque', 'pouls', 'coeur', 'cÅ“ur', 'bpm'],
  spo2: ['oxygene', 'saturation', 'spo2', 'spo 2'],
  temp: ['temperature', 'fievre'],
  sleep: ['sommeil', 'dormi'],
  stress: ['stress'],
  radiation: ['radiation'],
};

const LEVEL_WORD = ['stable', 'sous surveillance', 'critique'];

const sleepWords = (h) => {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return mm ? `${hh} heures ${mm}` : `${hh} heures`;
};

const VALUE = {
  hr: (v) => `rythme cardiaque ${v.hr} battements par minute`,
  spo2: (v) => `saturation en oxygÃ¨ne ${v.spo2} pour cent`,
  temp: (v) => `tempÃ©rature ${String(v.temp).replace('.', ',')} degrÃ©s`,
  sleep: (v) => `sommeil ${sleepWords(v.sleep)}`,
  stress: (v) => `stress estimÃ© Ã  ${v.stress} sur 100`,
  radiation: (v) => `radiation ${v.radiation} microsieverts par heure`,
};

const CHIPS = ['Ã‰tat de lâ€™Ã©quipage', 'Alertes', 'Rythme cardiaque dâ€™Amara', 'OxygÃ¨ne de Kenji'];

function answer(text, crew) {
  if (!crew.length) return 'Je nâ€™ai pas encore de donnÃ©es. VÃ©rifie que le serveur est dÃ©marrÃ©.';
  const t = norm(text);
  const who = crew.filter((a) => (NAMES[a.id] ? NAMES[a.id].words : []).some((w) => t.includes(w)));
  const metric = Object.keys(METRIC_WORDS).find((m) => METRIC_WORDS[m].some((w) => t.includes(w)));
  const spoken = (a) => (NAMES[a.id] ? NAMES[a.id].spoken : a.name);

  if (/\baide\b|que peux|que sais|commandes/.test(t)) {
    return 'Tu peux me demander lâ€™Ã©tat de lâ€™Ã©quipage, les alertes, ou une constante : par exemple rythme cardiaque dâ€™Amara, oxygÃ¨ne de Kenji ou sommeil de Lucia.';
  }
  if (/urgence|secours/.test(t)) {
    return 'En cas dâ€™urgence rÃ©elle, contacte immÃ©diatement le mÃ©decin de bord. Ceci est un prototype de dÃ©monstration.';
  }
  if (/alerte|probleme|anomalie/.test(t)) {
    const active = crew
      .flatMap((a) => a.status.alerts.map((x) => ({ a, x })))
      .sort((p, q) => q.x.level - p.x.level);
    if (active.length === 0) return 'Aucune alerte active. Tout lâ€™Ã©quipage est stable.';
    return active
      .slice(0, 3)
      .map(({ a, x }) => `${spoken(a)} : ${x.label}, niveau ${x.level === 2 ? 'critique' : 'attention'}. ${x.action}`)
      .join(' ');
  }
  if (metric) {
    const list = who.length ? who : crew;
    return list.map((a) => `${spoken(a)} : ${VALUE[metric](a.vitals)}.`).join(' ');
  }
  if (who.length || /etat|sante|equipage|bilan|comment|situation/.test(t)) {
    const list = who.length ? who : crew;
    return list
      .map((a) => {
        const base = `${spoken(a)} : ${LEVEL_WORD[a.status.level]}.`;
        const top = [...a.status.alerts].sort((x, y) => y.level - x.level)[0];
        return top ? `${base} Point dâ€™attention : ${top.label}.` : `${base} ${VALUE.hr(a.vitals)}.`;
      })
      .join(' ');
  }
  return 'Je nâ€™ai pas compris. Essaie : Ã©tat de lâ€™Ã©quipage, alertes, ou rythme cardiaque dâ€™Amara.';
}

// ---------- SynthÃ¨se vocale ----------
const voiceScore = (v) =>
  (/natural/i.test(v.name) ? 3 : /online/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0) +
  (v.lang.toLowerCase() === 'fr-fr' ? 0.5 : 0);

function frVoices() {
  if (!HAS_TTS) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith('fr'))
    .sort((a, b) => voiceScore(b) - voiceScore(a));
}

function speak(text, rate, voiceName) {
  if (!HAS_TTS) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = frVoices();
  const voice = voices.find((v) => v.name === voiceName) || voices[0];
  const parts = (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
  parts.forEach((part) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = 'fr-FR';
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
    /* ignorÃ© */
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
  const [voiceName, setVoiceName] = useState(() => loadPref('afya-voice-name', ''));
  const [voices, setVoices] = useState([]);
  const [log, setLog] = useState([
    { from: 'bot', text: 'Bonjour, je suis lâ€™assistant vocal Afya. Demande-moi lâ€™Ã©tat de lâ€™Ã©quipage.' },
  ]);

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
    const load = () => setVoices(frVoices());
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
    rec.lang = 'fr-FR';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      const msgs = {
        'not-allowed': 'Le micro est refusÃ© : autorise-le dans le navigateur.',
        network: 'La reconnaissance vocale demande une connexion internet (Chrome ou Edge).',
        'no-speech': 'Je nâ€™ai rien entendu, rÃ©essaie.',
      };
      say(msgs[e.error] || 'La reconnaissance vocale a Ã©chouÃ©. Utilise la zone de texte.');
    };
    rec.onresult = (e) => handleRef.current(e.results[0][0].transcript);
    recRef.current = rec;
    rec.start();
  };

  // Annonce vocale (courte) des nouvelles alertes critiques.
  useEffect(() => {
    if (!alerts.length) return;
    const newest = alerts[0].ts;
    const fresh = alerts.filter((x) => x.ts > lastTs.current && x.level === 2);
    lastTs.current = Math.max(lastTs.current, newest);
    if (!autoRef.current || fresh.length === 0) return;
    const shown = fresh
      .slice(0, 2)
      .map((x) => `Alerte critique pour ${x.astronaut} : ${x.label}. ${x.action}`)
      .join(' ');
    const short = fresh
      .slice(0, 2)
      .map((x) => `Alerte critique pour ${x.astronaut} : ${x.label}.`)
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
    savePref('afya-voice-name', v);
  };
  const testVoice = () => speak('Bonjour, voici la voix de lâ€™assistant Afya.', rateRef.current, voiceRef.current);

  return (
    <>
      {open && (
        <div className="voice-panel" role="dialog" aria-label="Assistant vocal">
          <strong>Assistant vocal Afya</strong>
          <div className="voice-opts">
            <label><input type="checkbox" checked={speakOn} onChange={(e) => setSpeakOn(e.target.checked)} /> RÃ©ponses vocales</label>
            <label><input type="checkbox" checked={autoAlerts} onChange={(e) => setAutoAlerts(e.target.checked)} /> Alertes vocales</label>
          </div>

          {HAS_TTS && (
            <div className="voice-set">
              <span>Vitesse</span>
              <input type="range" min="0.8" max="1.6" step="0.05" value={rate} onChange={(e) => changeRate(Number(e.target.value))} aria-label="Vitesse de la voix" />
              <span>{rate.toFixed(2)}Ã—</span>
              <span>Voix</span>
              <select value={voiceName} onChange={(e) => changeVoice(e.target.value)} aria-label="Choix de la voix">
                <option value="">Automatique (la plus naturelle)</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              <button type="button" className="btn" onClick={testVoice}>Tester</button>
            </div>
          )}

          <div className="voice-log">
            {log.map((m, i) => (
              <div key={i} className={`msg ${m.from}`}>{m.text}</div>
            ))}
          </div>

          <div className="voice-chips">
            {CHIPS.map((c) => (
              <button key={c} className="btn" onClick={() => handle(c)}>{c}</button>
            ))}
          </div>

          <form className="voice-input" onSubmit={send}>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ã‰cris ou parleâ€¦" aria-label="Commande" />
            <button type="submit" className="btn">Envoyer</button>
          </form>
          {!SR && <p className="muted small">Micro non disponible dans ce navigateur : utilise Chrome ou Edge, ou la zone de texte.</p>}
        </div>
      )}

      <button
        className={`voice-fab ${listening ? 'live' : ''}`}
        onClick={() => { if (!open) { setOpen(true); } else if (SR) { toggleMic(); } else { setOpen(false); } }}
        aria-label={listening ? 'ArrÃªter lâ€™Ã©coute' : 'Assistant vocal'}
        title={open ? 'Parler' : 'Ouvrir lâ€™assistant vocal'}
      >
        <MicIcon />
      </button>
      {open && <button className="voice-close" onClick={() => setOpen(false)}>Fermer</button>}
    </>
  );
}