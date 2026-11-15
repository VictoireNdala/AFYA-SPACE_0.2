// Voice assistant runtime shared by the Assistant page and the floating microphone.
// Speech uses the browser engines (Web Speech API); understanding stays on the onboard server (closed vocabulary).
// Language, voice, speed and the spoken-alert option come from the AFYA SPACE voice-assistant branch.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { post } from './api.js';
import { useApp } from './live.jsx';

export const SpeechRec = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
export const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

export const LANGS = {
  en: { code: 'en-US', tts: 'en', label: 'EN' },
  fr: { code: 'fr-FR', tts: 'fr', label: 'FR' },
};

const FR_TITLES = {
  'Total retinal thickness change vs baseline': 'variation de l’épaisseur rétinienne',
  'Refraction change vs baseline': 'variation de la réfraction',
  'Intraocular pressure': 'pression intraoculaire',
  'Safety signal during countermeasure session': 'signal de sécurité pendant une séance',
  'Venous safety signal in daily log': 'signal veineux dans le journal',
  'Heart rate': 'rythme cardiaque',
  'Oxygen saturation': 'saturation en oxygène',
  'Body temperature': 'température corporelle',
  Sleep: 'sommeil',
  'Stress index': 'indice de stress',
  'Radiation dose rate': 'débit de dose de radiation',
};

export const TEXT = {
  en: {
    hello: 'Hello, I am the SANS Guardian assistant. Ask for the crew status, the alerts, a vital sign or an eye measurement, or log your supplement.',
    test: 'Hello, this is the voice of the SANS Guardian assistant.',
    urgent: (a) => `Urgent alert for ${a.code}: ${a.title}.`,
    errors: { 'not-allowed': 'Microphone access denied: allow it in the browser.', network: 'Speech recognition needs a network connection in this browser (Chrome or Edge). Type instead.', 'no-speech': 'I did not hear anything, please try again.', other: 'Speech recognition failed. Type instead.' },
    failed: 'The onboard server did not answer.',
  },
  fr: {
    hello: 'Bonjour, je suis l’assistant SANS Guardian. Demande l’état de l’équipage, les alertes, une constante ou une mesure oculaire, ou enregistre ton supplément.',
    test: 'Bonjour, voici la voix de l’assistant SANS Guardian.',
    urgent: (a) => `Alerte urgente pour ${a.code} : ${FR_TITLES[a.title] ?? a.title}.`,
    errors: { 'not-allowed': 'Le micro est refusé : autorise-le dans le navigateur.', network: 'Dans ce navigateur, la reconnaissance vocale demande une connexion (Chrome ou Edge). Écris plutôt ta commande.', 'no-speech': 'Je n’ai rien entendu, réessaie.', other: 'La reconnaissance vocale a échoué. Écris plutôt ta commande.' },
    failed: 'Le serveur de bord n’a pas répondu.',
  },
};

const PREF_KEY = 'sg.voice';
const DEFAULTS = { lang: 'en', rate: 1.05, voices: { en: '', fr: '' }, speakOn: true, autoAlerts: true };
const loadPrefs = () => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') };
  } catch {
    return DEFAULTS;
  }
};

// Natural / online voices first (Edge "Natural", Chrome "Google"), exact locale before other variants.
const voiceScore = (v, code) => (/natural/i.test(v.name) ? 3 : /online/i.test(v.name) ? 2 : /google/i.test(v.name) ? 1 : 0) + (v.lang.toLowerCase() === code.toLowerCase() ? 0.5 : 0);
export function voicesFor(lang) {
  if (!HAS_TTS) return [];
  const L = LANGS[lang];
  return window.speechSynthesis
    .getVoices()
    .filter((v) => v.lang && v.lang.toLowerCase().startsWith(L.tts))
    .sort((a, b) => voiceScore(b, L.code) - voiceScore(a, L.code));
}

const VoiceCtx = createContext(null);

export function VoiceProvider({ children }) {
  const { selected, toasts } = useApp();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [voices, setVoices] = useState([]);
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [convo, setConvo] = useState(() => [{ who: 'bot', text: TEXT[loadPrefs().lang].hello }]);
  const recRef = useRef(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const setPref = useCallback((patch) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREF_KEY, JSON.stringify(next));
      } catch {
        /* private mode: keep in memory */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!HAS_TTS) return undefined;
    const load = () => setVoices(voicesFor(prefs.lang));
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, [prefs.lang]);

  /** Speak sentence by sentence (long single utterances get cut off in some browsers). */
  const speak = useCallback((text, { force = false } = {}) => {
    const p = prefsRef.current;
    if (!HAS_TTS || (!p.speakOn && !force)) return;
    const synth = window.speechSynthesis;
    synth.cancel();
    const list = voicesFor(p.lang);
    const voice = list.find((v) => v.name === p.voices[p.lang]) || list[0];
    const parts = (String(text).match(/[^.!?]+[.!?]*/g) || [text]).map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = LANGS[p.lang].code;
      u.rate = p.rate;
      if (voice) u.voice = voice;
      synth.speak(u);
    }
  }, []);

  const say = useCallback((text, extra = {}) => {
    setConvo((c) => [...c, { who: 'bot', text, ...extra }].slice(-40));
    speak(text);
  }, [speak]);

  const send = useCallback(async (raw) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    const lang = prefsRef.current.lang;
    setConvo((c) => [...c, { who: 'me', text }].slice(-40));
    setBusy(true);
    try {
      const r = await post('/voice', { text, code: selectedRef.current, lang });
      say(r.reply, { intent: r.intent, ok: r.ok });
    } catch {
      say(TEXT[lang].failed);
    } finally {
      setBusy(false);
    }
  }, [say]);

  const listen = useCallback(() => {
    if (!SpeechRec) return;
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    if (HAS_TTS) window.speechSynthesis.cancel();
    const lang = prefsRef.current.lang;
    const rec = new SpeechRec();
    rec.lang = LANGS[lang].code;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onerror = (e) => {
      const er = TEXT[lang].errors;
      if (e.error !== 'aborted') say(er[e.error] || er.other);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
    };
    recRef.current = rec;
    rec.start();
  }, [send, say]);

  const setLang = useCallback((lang) => {
    if (lang === prefsRef.current.lang) return;
    recRef.current?.abort();
    if (HAS_TTS) window.speechSynthesis.cancel();
    setPref({ lang });
    setConvo([{ who: 'bot', text: TEXT[lang].hello }]);
  }, [setPref]);

  const clear = useCallback(() => setConvo([{ who: 'bot', text: TEXT[prefsRef.current.lang].hello }]), []);

  // Short spoken announcement of each new URGENT alert pushed by the onboard server.
  const lastToast = useRef(0);
  useEffect(() => {
    const fresh = toasts.filter((x) => x.id > lastToast.current);
    if (!fresh.length) return;
    lastToast.current = Math.max(...fresh.map((x) => x.id));
    const urgent = fresh.filter((x) => x.alert.level === 'URGENT').map((x) => x.alert);
    if (!urgent.length || !prefsRef.current.autoAlerts) return;
    const T = TEXT[prefsRef.current.lang];
    const line = urgent.slice(0, 2).map(T.urgent).join(' ');
    setConvo((c) => [...c, { who: 'bot', text: line, alert: true }].slice(-40));
    speak(line, { force: true });
  }, [toasts, speak]);

  const value = useMemo(
    () => ({ prefs, setPref, setLang, voices, listening, busy, convo, send, listen, speak, clear }),
    [prefs, setPref, setLang, voices, listening, busy, convo, send, listen, speak, clear],
  );
  return <VoiceCtx.Provider value={value}>{children}</VoiceCtx.Provider>;
}

export const useVoice = () => useContext(VoiceCtx);
