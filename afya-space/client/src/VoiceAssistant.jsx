import { useEffect, useRef, useState } from 'react';

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Mots reconnus dans les deux langues (le texte est normalise sans accents).
const NAMES = {
  a1: { spoken: 'Amara', words: ['amara', 'diallo', 'commandant', 'commandante', 'commander'] },
  a2: { spoken: 'Kenji', words: ['kenji', 'mori', 'pilote', 'pilot'] },
  a3: { spoken: 'Lucia', words: ['lucia', 'alvarez', 'docteur', 'medecin', 'doctor', 'physician'] },
};

const METRIC_WORDS = {
  hr: ['rythme', 'cardiaque', 'pouls', 'coeur', 'c\u0153ur', 'bpm', 'heart', 'pulse'],
  spo2: ['oxygene', 'saturation', 'spo2', 'spo 2', 'oxygen'],
  temp: ['temperature', 'fievre', 'fever'],
  sleep: ['sommeil', 'dormi', 'sleep'],
  stress: ['stress'],
  radiation: ['radiation'],
};

// Libelles et actions en anglais (les versions francaises viennent du serveur).
const LABEL_EN = {
  hr: 'Heart rate',
  spo2: 'Oxygen saturation',
  temp: 'Body temperature',
  sleep: 'Sleep',
  stress: 'Stress level',
  radiation: 'Radiation',
};
const ACTION_EN = {
  hr: 'Check the current activity, take a break and recheck in 5 minutes.',
  spo2: 'Check the module air quality and the oxygen equipment.',
  temp: 'Hydration, rest and close monitoring; contact the onboard doctor.',
  sleep: 'Adjust the day schedule and protect the next rest period.',
  stress: 'Suggest a break, a team talk or a relaxation session.',
  radiation: 'Move to the best shielded area of the vessel and follow the radiation procedure.',
};
const labelOf = (x, lang) => (lang === 'en' ? LABEL_EN[x.metric] || x.label : x.label);
const actionOf = (x, lang) => (lang === 'en' ? ACTION_EN[x.metric] || x.action : x.action);

const hm = (h) => {
  let hh = Math.floor(h);
  let mm = Math.round((h - hh) * 60);
  if (mm === 60) { hh += 1; mm = 0; }
  return [hh, mm];
};

const DICT = {
  fr: {
    code: 'fr-FR',
    tts: 'fr',
    colon: ' : ',
    hello: 'Bonjour, je suis l\u2019assistant vocal Afya. Demande-moi l\u2019\u00e9tat de l\u2019\u00e9quipage.',
    noData: 'Je n\u2019ai pas encore de donn\u00e9es. V\u00e9rifie que le serveur est d\u00e9marr\u00e9.',
    help: 'Tu peux me demander l\u2019\u00e9tat de l\u2019\u00e9quipage, les alertes, ou une constante : par exemple rythme cardiaque d\u2019Amara, oxyg\u00e8ne de Kenji ou sommeil de Lucia.',
    emergency: 'En cas d\u2019urgence r\u00e9elle, contacte imm\u00e9diatement le m\u00e9decin de bord. Ceci est un prototype de d\u00e9monstration.',
    noAlerts: 'Aucune alerte active. Tout l\u2019\u00e9quipage est stable.',
    notUnderstood: 'Je n\u2019ai pas compris. Essaie : \u00e9tat de l\u2019\u00e9quipage, alertes, ou rythme cardiaque d\u2019Amara.',
    alertLine: (n, l, lv, a) => `${n} : ${l}, niveau ${lv === 2 ? 'critique' : 'attention'}. ${a}`,
    attention: (l) => `Point d\u2019attention : ${l}.`,
    levelWord: ['stable', 'sous surveillance', 'critique'],
    value: {
      hr: (v) => `rythme cardiaque ${v.hr} battements par minute`,
      spo2: (v) => `saturation en oxyg\u00e8ne ${v.spo2} pour cent`,
      temp: (v) => `temp\u00e9rature ${String(v.temp).replace('.', ',')} degr\u00e9s`,
      sleep: (v) => {
        const [hh, mm] = hm(v.sleep);
        return mm ? `sommeil ${hh} heures ${mm}` : `sommeil ${hh} heures`;
      },
      stress: (v) => `stress estim\u00e9 \u00e0 ${v.stress} sur 100`,
      radiation: (v) => `radiation ${v.radiation} microsieverts par heure`,
    },
    chips: ['\u00c9tat de l\u2019\u00e9quipage', 'Alertes', 'Rythme cardiaque d\u2019Amara', 'Oxyg\u00e8ne de Kenji'],
    alertSpoken: (n, l) => `Alerte critique pour ${n} : ${l}.`,
    alertShown: (n, l, a) => `Alerte critique pour ${n} : ${l}. ${a}`,
    title: 'Assistant vocal Afya',
    language: 'Langue',
    speakOpt: 'R\u00e9ponses vocales',
    alertOpt: 'Alertes vocales',
    speed: 'Vitesse',
    voice: 'Voix',
    auto: 'Automatique (la plus naturelle)',
    test: 'Tester',
    send: 'Envoyer',
    close: 'Fermer',
    placeholder: '\u00c9cris ou parle\u2026',
    noMic: 'Micro non disponible dans ce navigateur : utilise Chrome ou Edge, ou la zone de texte.',
    testPhrase: 'Bonjour, voici la voix de l\u2019assistant Afya.',
    errors: {
      notAllowed: 'Le micro est refus\u00e9 : autorise-le dans le navigateur.',
      network: 'La reconnaissance vocale demande une connexion internet (Chrome ou Edge).',
      noSpeech: 'Je n\u2019ai rien entendu, r\u00e9essaie.',
      other: 'La reconnaissance vocale a \u00e9chou\u00e9. Utilise la zone de texte.',
    },
    ariaSpeed: 'Vitesse de la voix',
    ariaVoice: 'Choix de la voix',
    ariaCmd: 'Commande',
    micStop: 'Arr\u00eater l\u2019\u00e9coute',
    micOpen: 'Assistant vocal',
    titleOpen: 'Ouvrir l\u2019assistant vocal',
    titleTalk: 'Parler',
  },
  en: {
    code: 'en-US',
    tts: 'en',
    colon: ': ',
    hello: 'Hello, I am the Afya voice assistant. Ask me for the crew status.',
    noData: 'I do not have data yet. Check that the server is running.',
    help: 'You can ask me for the crew status, the alerts, or a vital sign: for example Amara\u2019s heart rate, Kenji\u2019s oxygen or Lucia\u2019s sleep.',
    emergency: 'In a real emergency, contact the onboard doctor immediately. This is a demonstration prototype.',
    noAlerts: 'No active alerts. The whole crew is stable.',
    notUnderstood: 'I did not understand. Try: crew status, alerts, or Amara\u2019s heart rate.',
    alertLine: (n, l, lv, a) => `${n}: ${l}, ${lv === 2 ? 'critical' : 'warning'} level. ${a}`,
    attention: (l) => `Point of attention: ${l}.`,
    levelWord: ['stable', 'under watch', 'critical'],
    value: {
      hr: (v) => `heart rate ${v.hr} beats per minute`,
      spo2: (v) => `oxygen saturation ${v.spo2} percent`,
      temp: (v) => `temperature ${String(v.temp).replace('.', ' point ')} degrees`,
      sleep: (v) => {
        const [hh, mm] = hm(v.sleep);
        return mm ? `sleep ${hh} hours ${mm} minutes` : `sleep ${hh} hours`;
      },
      stress: (v) => `stress estimated at ${v.stress} out of 100`,
      radiation: (v) => `radiation ${v.radiation} microsieverts per hour`,
    },
    chips: ['Crew status', 'Alerts', 'Amara\u2019s heart rate', 'Kenji\u2019s oxygen'],
    alertSpoken: (n, l) => `Critical alert for ${n}: ${l}.`,
    alertShown: (n, l, a) => `Critical alert for ${n}: ${l}. ${a}`,
    title: 'Afya voice assistant',
    language: 'Language',
    speakOpt: 'Voice replies',
    alertOpt: 'Voice alerts',
    speed: 'Speed',
    voice: 'Voice',
    auto: 'Automatic (most natural)',
    test: 'Test',
    send: 'Send',
    close: 'Close',
    placeholder: 'Type or speak\u2026',
    noMic: 'Microphone not available in this browser: use Chrome or Edge, or the text box.',
    testPhrase: 'Hello, this is the voice of the Afya assistant.',
    errors: {
      notAllowed: 'Microphone access denied: allow it in the browser.',
      network: 'Speech recognition needs an internet connection (Chrome or Edge).',
      noSpeech: 'I did not hear anything, please try again.',
      other: 'Speech recognition failed. Use the text box.',
    },
    ariaSpeed: 'Voice speed',
    ariaVoice: 'Voice choice',
    ariaCmd: 'Command',
    micStop: 'Stop listening',
    micOpen: 'Voice assistant',
    titleOpen: 'Open the voice assistant',
    titleTalk: 'Speak',
  },
};

function answer(text, crew, L, lang) {
  if (!crew.length) return L.noData;
  const t = norm(text);
  const who = crew.filter((a) => (NAMES[a.id] ? NAMES[a.id].words : []).some((w) => t.includes(w)));
  const metric = Object.keys(METRIC_WORDS).find((m) => METRIC_WORDS[m].some((w) => t.includes(w)));
  const spoken = (a) => (NAMES[a.id] ? NAMES[a.id].spoken : a.name);

  if (/\baide\b|que peux|que sais|commandes|\bhelp\b|what can you|commands/.test(t)) return L.help;
  if (/urgence|secours|emergency/.test(t)) return L.emergency;
  if (/alerte|probleme|anomalie|alert|alarm|problem|anomaly|warning/.test(t)) {
    const active = crew
      .flatMap((a) => a.status.alerts.map((x) => ({ a, x })))
      .sort((p, q) => q.x.level - p.x.level);
    if (active.length === 0) return L.noAlerts;
    return active
      .slice(0, 3)
      .map(({ a, x }) => L.alertLine(spoken(a), labelOf(x, lang), x.level, actionOf(x, lang)))
      .join(' ');
  }
  if (metric) {
    const list = who.length ? who : crew;
    return list.map((a) => `${spoken(a)}${L.colon}${L.value[metric](a.vitals)}.`).join(' ');
  }
  if (who.length || /etat|sante|equipage|bilan|comment|situation|status|health|crew|report|how is|how are/.test(t)) {
    const list = who.length ? who : crew;
    return list
      .map((a) => {
        const base = `${spoken(a)}${L.colon}${L.levelWord[a.status.level]}.`;
        const top = [...a.status.alerts].sort((x, y) => y.level - x.level)[0];
        return top ? `${base} ${L.attention(labelOf(top, lang))}` : `${base} ${L.value.hr(a.vitals)}.`;
      })
      .join(' ');
  }
  return L.notUnderstood;
}

// ---------- Synthese vocale ----------
const voiceScore = (v, code) =>
  (/natural/i.test(v.name) ? 3 : /online/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0) +
  (v.lang.toLowerCase() === code.toLowerCase() ? 0.5 : 0);

function voicesFor(L) {
  if (!HAS_TTS) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith(L.tts))
    .sort((a, b) => voiceScore(b, L.code) - voiceScore(a, L.code));
}

function speak(text, rate, voiceName, L) {
  if (!HAS_TTS) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voices = voicesFor(L);
  const voice = voices.find((v) => v.name === voiceName) || voices[0];
  const parts = (text.match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
  parts.forEach((part) => {
    const u = new SpeechSynthesisUtterance(part);
    u.lang = L.code;
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
  const [lang, setLang] = useState(() => (loadPref('afya-voice-lang', 'fr') === 'en' ? 'en' : 'fr'));
  const L = DICT[lang];

  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [input, setInput] = useState('');
  const [speakOn, setSpeakOn] = useState(true);
  const [autoAlerts, setAutoAlerts] = useState(true);
  const [rate, setRate] = useState(() => Number(loadPref('afya-voice-rate', 1.2)) || 1.2);
  const [voiceName, setVoiceName] = useState(() => loadPref(`afya-voice-name-${lang}`, ''));
  const [voices, setVoices] = useState([]);
  const [log, setLog] = useState(() => [{ from: 'bot', text: DICT[lang].hello }]);

  const recRef = useRef(null);
  const crewRef = useRef(crew);
  const speakRef = useRef(speakOn);
  const autoRef = useRef(autoAlerts);
  const rateRef = useRef(rate);
  const voiceRef = useRef(voiceName);
  const langRef = useRef(lang);
  const lastTs = useRef(Date.now());
  crewRef.current = crew;
  speakRef.current = speakOn;
  autoRef.current = autoAlerts;
  rateRef.current = rate;
  voiceRef.current = voiceName;
  langRef.current = lang;

  useEffect(() => {
    if (!HAS_TTS) return undefined;
    const load = () => setVoices(voicesFor(DICT[lang]));
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [lang]);

  const say = (text, spokenText) => {
    setLog((l) => [...l, { from: 'bot', text }].slice(-30));
    if (speakRef.current) speak(spokenText || text, rateRef.current, voiceRef.current, DICT[langRef.current]);
  };

  const handle = (text) => {
    const clean = text.trim();
    if (!clean) return;
    const lg = langRef.current;
    const reply = answer(clean, crewRef.current, DICT[lg], lg);
    setLog((l) => [...l, { from: 'me', text: clean }, { from: 'bot', text: reply }].slice(-30));
    if (speakRef.current) speak(reply, rateRef.current, voiceRef.current, DICT[lg]);
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
    rec.lang = DICT[langRef.current].code;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      const er = DICT[langRef.current].errors;
      const msgs = { 'not-allowed': er.notAllowed, network: er.network, 'no-speech': er.noSpeech };
      say(msgs[e.error] || er.other);
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
    const lg = langRef.current;
    const Lc = DICT[lg];
    const nameOf = (x) => (NAMES[x.astronautId] ? NAMES[x.astronautId].spoken : x.astronaut);
    const shown = fresh
      .slice(0, 2)
      .map((x) => Lc.alertShown(nameOf(x), labelOf(x, lg), actionOf(x, lg)))
      .join(' ');
    const short = fresh
      .slice(0, 2)
      .map((x) => Lc.alertSpoken(nameOf(x), labelOf(x, lg)))
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
    savePref(`afya-voice-name-${lang}`, v);
  };
  const changeLang = (next) => {
    if (next === lang) return;
    if (recRef.current && listening) recRef.current.stop();
    if (HAS_TTS) window.speechSynthesis.cancel();
    setLang(next);
    savePref('afya-voice-lang', next);
    setVoiceName(loadPref(`afya-voice-name-${next}`, ''));
    setLog([{ from: 'bot', text: DICT[next].hello }]);
  };
  const testVoice = () => speak(L.testPhrase, rateRef.current, voiceRef.current, L);

  return (
    <>
      {open && (
        <div className="voice-panel" role="dialog" aria-label={L.title}>
          <strong>{L.title}</strong>

          <div className="voice-lang">
            <span>{L.language}</span>
            <button type="button" className={`btn ${lang === 'fr' ? 'active' : ''}`} onClick={() => changeLang('fr')}>FR</button>
            <button type="button" className={`btn ${lang === 'en' ? 'active' : ''}`} onClick={() => changeLang('en')}>EN</button>
          </div>

          <div className="voice-opts">
            <label><input type="checkbox" checked={speakOn} onChange={(e) => setSpeakOn(e.target.checked)} /> {L.speakOpt}</label>
            <label><input type="checkbox" checked={autoAlerts} onChange={(e) => setAutoAlerts(e.target.checked)} /> {L.alertOpt}</label>
          </div>

          {HAS_TTS && (
            <div className="voice-set">
              <span>{L.speed}</span>
              <input type="range" min="0.8" max="1.6" step="0.05" value={rate} onChange={(e) => changeRate(Number(e.target.value))} aria-label={L.ariaSpeed} />
              <span>{rate.toFixed(2)}x</span>
              <span>{L.voice}</span>
              <select value={voiceName} onChange={(e) => changeVoice(e.target.value)} aria-label={L.ariaVoice}>
                <option value="">{L.auto}</option>
                {voices.map((v) => (
                  <option key={v.name} value={v.name}>{v.name}</option>
                ))}
              </select>
              <button type="button" className="btn" onClick={testVoice}>{L.test}</button>
            </div>
          )}

          <div className="voice-log">
            {log.map((m, i) => (
              <div key={i} className={`msg ${m.from}`}>{m.text}</div>
            ))}
          </div>

          <div className="voice-chips">
            {L.chips.map((c) => (
              <button key={c} className="btn" onClick={() => handle(c)}>{c}</button>
            ))}
          </div>

          <form className="voice-input" onSubmit={send}>
            <input type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder={L.placeholder} aria-label={L.ariaCmd} />
            <button type="submit" className="btn">{L.send}</button>
          </form>
          {!SR && <p className="muted small">{L.noMic}</p>}
        </div>
      )}

      <button
        className={`voice-fab ${listening ? 'live' : ''}`}
        onClick={() => { if (!open) { setOpen(true); } else if (SR) { toggleMic(); } else { setOpen(false); } }}
        aria-label={listening ? L.micStop : L.micOpen}
        title={open ? L.titleTalk : L.titleOpen}
      >
        <MicIcon />
      </button>
      {open && <button className="voice-close" onClick={() => setOpen(false)}>{L.close}</button>}
    </>
  );
}