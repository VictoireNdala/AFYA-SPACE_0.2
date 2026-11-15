import { useApi, useApp } from '../lib/live.jsx';
import { useVoice } from '../lib/voice.jsx';
import Icon from '../components/Icon.jsx';
import { Panel, CrewPicker, Empty } from '../components/chrome.jsx';
import { VoiceConsole, VoiceSettings } from '../components/Voice.jsx';

const CAN = [
  ['Log', 'Supplement taken, blurry vision with a level 0–3'],
  ['Countermeasures', 'Start or stop a thigh-cuff or LBNP session'],
  ['Crew', 'Status of the crew or of one astronaut (AST-003, “the pilot”)'],
  ['Alerts', 'Open alerts, urgent first'],
  ['Vitals', 'Heart rate, oxygen, temperature, sleep, stress, radiation'],
  ['Eyes', 'Retinal thickness, refraction, eye pressure vs baseline'],
  ['Operations', 'Today’s reminders, radio link status'],
];

export default function Assistant() {
  const { selected, setSelected } = useApp();
  const { data: astro } = useApi(`/astronauts/${selected}`);
  const v = useVoice();

  return (
    <div className="grid" style={{ gap: 20 }}>
      <CrewPicker value={selected} onChange={setSelected} />
      <div className="grid g-12">
        <Panel className="span-8" title={`Speaking as ${selected}`} subtitle="Closed vocabulary, in English or French: the assistant triggers known actions or reads known values, and never gives medical advice." actions={
          <button className="btn ghost sm" onClick={v.clear}><Icon name="refresh" size={14} /> Clear</button>
        }>
          <VoiceConsole />
        </Panel>

        <div className="span-4 grid" style={{ gap: 18, alignContent: 'start' }}>
          <Panel title="Voice settings" subtitle="Saved in this browser. Urgent alerts are announced on every page.">
            <VoiceSettings />
          </Panel>
          <Panel title="Today's reminders" subtitle={`For ${selected}. Also read aloud on request.`}>
            {!astro ? <Empty>Loading…</Empty> : astro.reminders.length === 0 ? <Empty>Nothing pending.</Empty> : (
              <div className="list">
                {astro.reminders.map((r) => (
                  <div key={r} className="list-item"><Icon name="bell" size={14} className="muted" /><span className="grow small">{r}</span></div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <Panel className="span-6" title="What it understands" subtitle="Anything else is refused. Medical questions get a fixed answer.">
          <div className="list">
            {CAN.map(([k, d]) => (
              <div key={k} className="list-item"><b className="small" style={{ minWidth: 118 }}>{k}</b><span className="grow small soft">{d}</span></div>
            ))}
          </div>
        </Panel>
        <Panel className="span-6 flat" title="How it works offline" subtitle="Design of the onboard assistant.">
          <div className="stack small soft">
            <p><b style={{ color: 'var(--text)' }}>Understanding:</b> a rule-based parser on the onboard server maps the transcript to a fixed list of intents, in English or French (accents and punctuation ignored). Actions apply to the astronaut speaking; questions can name another crew member.</p>
            <p><b style={{ color: 'var(--text)' }}>Speech:</b> this demo uses the browser speech engines, with the most natural installed voice chosen first. Speech recognition may need a network in Chrome or Edge; the onboard build targets Faster-Whisper (speech-to-text) and Piper (voice), both offline.</p>
            <p><b style={{ color: 'var(--text)' }}>Safety:</b> replies only read logged values and demo thresholds. Medical questions and emergencies get fixed answers that point to the crew medical officer and the flight surgeon.</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}
