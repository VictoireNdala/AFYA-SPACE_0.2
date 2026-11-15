import { useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { useApp } from '../lib/live.jsx';
import { useVoice, SpeechRec, HAS_TTS, LANGS, TEXT } from '../lib/voice.jsx';

const UI = {
  en: { speak: 'Tap and speak a command', type: 'Type a command', listening: 'Listening…', thinking: 'Onboard server…', placeholder: 'Type a command…', send: 'Send', try: 'Try', noMic: 'Speech recognition is not available in this browser: type instead (Chrome or Edge for the microphone).', as: 'Speaking as', open: 'Open the voice assistant', close: 'Close', full: 'Full assistant' },
  fr: { speak: 'Touche et dis une commande', type: 'Écris une commande', listening: 'J’écoute…', thinking: 'Serveur de bord…', placeholder: 'Écris une commande…', send: 'Envoyer', try: 'Essaie', noMic: 'La reconnaissance vocale n’est pas disponible dans ce navigateur : écris ta commande (Chrome ou Edge pour le micro).', as: 'Je parle en tant que', open: 'Ouvrir l’assistant vocal', close: 'Fermer', full: 'Assistant complet' },
};

/** Conversation, microphone, text input and example chips. */
export function VoiceConsole({ compact = false }) {
  const { state, selected } = useApp();
  const v = useVoice();
  const [text, setText] = useState('');
  const endRef = useRef(null);
  const u = UI[v.prefs.lang];
  const examples = (v.prefs.lang === 'fr' ? state?.voiceExamplesFr : state?.voiceExamples) ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [v.convo]);

  const submit = (e) => {
    e.preventDefault();
    v.send(text);
    setText('');
  };

  return (
    <div className={`voice-console ${compact ? 'compact' : ''}`}>
      <div className="row" style={{ gap: compact ? 14 : 22, alignItems: 'center' }}>
        <button className={`mic ${v.listening ? 'listening' : ''}`} onClick={v.listen} disabled={!SpeechRec} aria-label={v.listening ? 'Stop listening' : 'Start listening'} title={SpeechRec ? u.speak : u.noMic}>
          <Icon name="mic" size={compact ? 22 : 30} stroke={1.75} />
        </button>
        <div className="stack" style={{ gap: 3, minWidth: 0 }}>
          <b style={{ fontSize: compact ? 14 : 16 }}>{v.listening ? u.listening : v.busy ? u.thinking : SpeechRec ? u.speak : u.type}</b>
          <span className="small soft">{u.as} <b style={{ color: 'var(--text)' }}>{selected}</b> · {LANGS[v.prefs.lang].label}</span>
        </div>
      </div>
      <div className="convo" aria-live="polite">
        {v.convo.map((m, i) => (
          <div key={i} className={`bubble ${m.who} ${m.alert ? 'alert' : ''} ${m.ok === false ? 'refused' : ''}`}>
            {m.text}
            {m.intent && <span className="intent">{m.intent.replace(/_/g, ' ')}</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="row" style={{ gap: 8 }} onSubmit={submit}>
        <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder={u.placeholder} aria-label="Command" />
        <button className="btn primary" type="submit" disabled={v.busy}><Icon name="send" size={14} /> {!compact && u.send}</button>
      </form>
      <div className="chips">
        {(compact ? examples.slice(4, 8) : examples).map((ex) => (
          <button key={ex} className="chip" onClick={() => v.send(ex)}>{ex}</button>
        ))}
      </div>
      {!SpeechRec && <p className="small soft" style={{ margin: 0 }}>{u.noMic}</p>}
    </div>
  );
}

const SET = {
  en: { lang: 'Language', replies: 'Spoken replies', alerts: 'Announce urgent alerts', voice: 'Voice', auto: 'Automatic (most natural)', speed: 'Speed', test: 'Test', none: 'No speech engine in this browser.' },
  fr: { lang: 'Langue', replies: 'Réponses vocales', alerts: 'Annoncer les alertes urgentes', voice: 'Voix', auto: 'Automatique (la plus naturelle)', speed: 'Vitesse', test: 'Tester', none: 'Pas de synthèse vocale dans ce navigateur.' },
};

/** Language, voice, speed, spoken replies and spoken alerts. Saved in this browser. */
export function VoiceSettings() {
  const v = useVoice();
  const s = SET[v.prefs.lang];
  const fill = ((v.prefs.rate - 0.8) / 0.8) * 100;
  return (
    <div className="voice-settings">
      <div className="vs-row">
        <span className="small soft">{s.lang}</span>
        <div className="seg" role="group" aria-label={s.lang}>
          {Object.entries(LANGS).map(([k, L]) => (
            <button key={k} type="button" aria-pressed={v.prefs.lang === k} onClick={() => v.setLang(k)}>{L.label}</button>
          ))}
        </div>
      </div>
      <label className="vs-row small"><span className="soft"><Icon name="volume" size={14} /> {s.replies}</span><input type="checkbox" checked={v.prefs.speakOn} onChange={(e) => v.setPref({ speakOn: e.target.checked })} /></label>
      <label className="vs-row small"><span className="soft"><Icon name="bell" size={14} /> {s.alerts}</span><input type="checkbox" checked={v.prefs.autoAlerts} onChange={(e) => v.setPref({ autoAlerts: e.target.checked })} /></label>
      {HAS_TTS ? (
        <>
          <div className="vs-col">
            <span className="small soft">{s.voice}</span>
            <select className="input" value={v.prefs.voices[v.prefs.lang] ?? ''} onChange={(e) => v.setPref({ voices: { ...v.prefs.voices, [v.prefs.lang]: e.target.value } })} aria-label={s.voice}>
              <option value="">{s.auto}</option>
              {v.voices.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
            </select>
          </div>
          <div className="vs-row">
            <span className="small soft">{s.speed}</span>
            <input type="range" min="0.8" max="1.6" step="0.05" value={v.prefs.rate} style={{ '--fill': `${fill}%`, flex: 1 }} onChange={(e) => v.setPref({ rate: Number(e.target.value) })} aria-label={s.speed} />
            <span className="small mono">{v.prefs.rate.toFixed(2)}×</span>
            <button type="button" className="btn ghost sm" onClick={() => v.speak(TEXT[v.prefs.lang].test, { force: true })}>{s.test}</button>
          </div>
        </>
      ) : (
        <p className="small soft" style={{ margin: 0 }}>{s.none}</p>
      )}
    </div>
  );
}

/** Floating microphone on every page (except the Assistant page): opens a compact console. */
export function VoiceDock({ hidden, onOpenFull }) {
  const v = useVoice();
  const [open, setOpen] = useState(false);
  const u = UI[v.prefs.lang];
  if (hidden) return null;
  return (
    <>
      {open && (
        <div className="voice-dock" role="dialog" aria-label="Voice assistant">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="eyebrow">Voice assistant</span>
            <div className="row" style={{ gap: 6 }}>
              <div className="seg" role="group" aria-label="Language">
                {Object.entries(LANGS).map(([k, L]) => (
                  <button key={k} type="button" aria-pressed={v.prefs.lang === k} onClick={() => v.setLang(k)}>{L.label}</button>
                ))}
              </div>
              <button className="btn ghost sm" onClick={() => { setOpen(false); onOpenFull(); }}>{u.full}</button>
              <button className="icon-btn" onClick={() => setOpen(false)} aria-label={u.close}><Icon name="x" size={16} /></button>
            </div>
          </div>
          <VoiceConsole compact />
        </div>
      )}
      <button className={`voice-fab ${v.listening ? 'live' : ''} ${open ? 'open' : ''}`} onClick={() => (open ? v.listen() : setOpen(true))} aria-label={open ? 'Speak' : u.open} title={open ? 'Speak' : u.open}>
        <Icon name="mic" size={22} stroke={1.75} />
      </button>
    </>
  );
}
