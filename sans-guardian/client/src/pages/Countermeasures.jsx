import { useEffect, useState } from 'react';
import { useApi, useApp } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import Icon, { LevelBadge } from '../components/Icon.jsx';
import { Panel, CrewPicker, Empty, Stat } from '../components/chrome.jsx';
import { ChartFrame, LegendLine, C } from '../charts/core.jsx';
import { AdherenceHeatmap } from '../charts/small.jsx';
import RankedBars from '../charts/RankedBars.jsx';
import { dayLabel, clockTime, pct } from '../lib/format.js';

export default function Countermeasures() {
  const { selected, setSelected, state } = useApp();
  const { data } = useApi(`/astronauts/${selected}`);
  const { data: crewData } = useApi('/crew');
  if (!data || !state) return <Panel><Empty>Loading countermeasures…</Empty></Panel>;
  const sup = state.protocol.supplement;
  const a = data.adherence;
  const logDose = () => post('/logs/supplement', { code: selected, taken: true }).catch(() => {});

  return (
    <div className="grid" style={{ gap: 20 }}>
      <CrewPicker value={selected} onChange={setSelected} />

      <div className="grid g-12">
        <Panel className="span-8">
          <ChartFrame
            title="B-vitamin supplement log"
            subtitle={`${sup.label}. One pill per day from 6 months before launch to 30 days after landing. Each column is one week.`}
            actions={a.scheduledToday && (
              <button className={`btn sm ${a.takenToday ? '' : 'primary'}`} onClick={logDose} disabled={a.takenToday}>
                <Icon name={a.takenToday ? 'tick' : 'pill'} size={13} /> {a.takenToday ? 'Logged today' : "Log today's dose"}
              </button>
            )}
            footer={<span>Source: NASA B-vitamin study protocol · doses are chosen by the medical team, never by the app</span>}
          >
            <AdherenceHeatmap calendar={a.calendar} today={data.mission.day} landing={data.mission.landingDay} />
          </ChartFrame>
          <div className="stats" style={{ marginTop: 16 }}>
            <Stat label="Last 7 days" value={pct(a.d7)} />
            <Stat label="Last 30 days" value={pct(a.d30)} sub={a.d30 != null && a.d30 < sup.adherenceWatchBelowPct ? `Below the ${sup.adherenceWatchBelowPct}% watch level (demo)` : `Watch below ${sup.adherenceWatchBelowPct}% (demo)`} />
            <Stat label="Since start" value={pct(a.all)} />
          </div>
        </Panel>

        <Panel className="span-4">
          <ChartFrame
            title="Crew adherence, last 30 days"
            subtitle="Share of scheduled doses logged."
            legend={<><LegendLine color={C.series1} label={selected} /><LegendLine color={C.contextBar} label="Rest of crew" /></>}
          >
            {crewData ? (
              <RankedBars rows={crewData.crew.map((c) => ({ id: c.code, label: c.code, sub: c.role, value: c.adherence30 }))} highlight={selected} unit="%" decimals={0} signedValues={false} thresholds={[{ level: 'WATCH', value: sup.adherenceWatchBelowPct }]} onSelect={setSelected} />
            ) : <Empty>Loading…</Empty>}
          </ChartFrame>
        </Panel>
      </div>

      <SessionPanel data={data} />

      <Panel title="Session history" subtitle="Thigh-cuff (NASA study design: 2 sessions of 6 hours) and LBNP sessions.">
        {data.sessions.length === 0 ? <Empty>No session yet.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Day</th><th>Type</th><th className="num">Duration</th><th className="num">Setting</th><th className="num">Tolerance (0-3)</th><th>Safety signals</th><th>Notes</th></tr></thead>
              <tbody>
                {data.sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="mono">{dayLabel(s.day)}</td>
                    <td>{s.type === 'LBNP' ? 'LBNP' : 'Thigh cuffs'}{s.status === 'active' && <span className="badge info" style={{ marginLeft: 8 }}>In progress</span>}</td>
                    <td className="num">{s.status === 'active' ? '–' : `${Math.round(s.minutes)} min`}</td>
                    <td className="num">{s.parameter} mmHg</td>
                    <td className="num">{s.tolerance ?? '–'}</td>
                    <td>{s.signals.length ? <LevelBadge level="URGENT" /> : <span className="muted">None</span>} {s.signals.map((id) => state.protocol.safetySignals.find((x) => x.id === id)?.label ?? id).join(', ')}</td>
                    <td className="soft small">{s.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function SessionPanel({ data }) {
  const { state } = useApp();
  const code = data.astronaut.code;
  const cms = state.protocol.countermeasures;
  const signalsDef = state.protocol.safetySignals;
  const active = data.activeSession;
  const [type, setType] = useState('THIGH_CUFF');
  const [param, setParam] = useState(cms.THIGH_CUFF.defaultParameter);
  const [signals, setSignals] = useState([]);
  const [noneConfirmed, setNoneConfirmed] = useState(false);
  const [tolerance, setTolerance] = useState(0);
  const [notes, setNotes] = useState('');
  const [msg, setMsg] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    setParam(cms[type].defaultParameter);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    setSignals([]);
    setNoneConfirmed(false);
    setMsg('');
  }, [active?.id, code]);

  const toggle = (id) => {
    setNoneConfirmed(false);
    setSignals((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };
  const start = async () => {
    try {
      await post('/sessions/start', { code, type, parameter: Number(param) });
      setMsg('');
    } catch (e) {
      setMsg(e.message);
    }
  };
  const report = async () => {
    try {
      const r = await post(`/sessions/${active.id}/signal`, { signals });
      setMsg(r.message);
    } catch (e) {
      setMsg(e.message);
    }
  };
  const stop = async () => {
    try {
      await post(`/sessions/${active.id}/stop`, { tolerance, signals, notes });
      setNotes('');
      setMsg('Session saved locally and queued for downlink.');
    } catch (e) {
      setMsg(e.message);
    }
  };

  const def = active ? cms[active.type] : cms[type];
  const elapsed = active ? now - active.start_ts : 0;
  const progress = Math.min(1, elapsed / (def.targetMinutes * 60000));
  const R = 64;
  const circ = 2 * Math.PI * R;

  return (
    <Panel title="Countermeasure session" subtitle="NASA research countermeasures, not proven treatments. Settings come from the medical protocol; values shown are demo values.">
      <div className="grid g-12" style={{ alignItems: 'start' }}>
        <div className="span-5 stack" style={{ gap: 16 }}>
          {!active ? (
            <>
              <div className="seg" role="group" aria-label="Session type">
                <button aria-pressed={type === 'THIGH_CUFF'} onClick={() => setType('THIGH_CUFF')}>Thigh cuffs</button>
                <button aria-pressed={type === 'LBNP'} onClick={() => setType('LBNP')}>LBNP</button>
              </div>
              <p className="soft small">{cms[type].label}. {cms[type].source}.</p>
              <div className="row">
                <div className="field" style={{ flex: 1 }}>
                  <label htmlFor="param">{cms[type].parameterLabel} ({cms[type].parameterUnit}, demo value)</label>
                  <input id="param" className="input" type="number" value={param} onChange={(e) => setParam(e.target.value)} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <span className="label">Target duration</span>
                  <div className="input" style={{ background: 'transparent' }}>{cms[type].targetMinutes >= 60 ? `${cms[type].targetMinutes / 60} h` : `${cms[type].targetMinutes} min`}</div>
                </div>
              </div>
              <button className="btn primary lg" onClick={start}><Icon name="play" size={14} /> Start session for {code}</button>
            </>
          ) : (
            <div className="row" style={{ gap: 22 }}>
              <svg width="150" height="150" viewBox="0 0 150 150" className="ring-progress" aria-hidden="true">
                <circle cx="75" cy="75" r={R} fill="none" stroke="rgba(58,159,214,.16)" strokeWidth="8" />
                <circle cx="75" cy="75" r={R} fill="none" stroke={C.series1} strokeWidth="8" strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)} />
              </svg>
              <div className="stack" style={{ gap: 6 }}>
                <span className="eyebrow">{active.type === 'LBNP' ? 'LBNP' : 'Thigh cuffs'} · in progress</span>
                <span className="timer">{clockTime(elapsed)}</span>
                <span className="soft small">Target {clockTime(def.targetMinutes * 60000)} · {active.parameter} mmHg</span>
              </div>
            </div>
          )}
          {msg && <p className="small soft">{msg}</p>}
        </div>

        <div className="span-7 stack" style={{ gap: 10 }}>
          <div className="row between">
            <div>
              <div className="eyebrow">Safety checklist · required for every session</div>
              <p className="small soft" style={{ marginTop: 4 }}>Slow venous flow is a known risk factor for clots (NASA observed one case). Tick anything you notice. Any tick sends an URGENT alert to the flight surgeon.</p>
            </div>
          </div>
          <div className="grid g-2" style={{ gap: 8 }}>
            {signalsDef.map((s) => (
              <label key={s.id} className={`check ${signals.includes(s.id) ? 'on' : ''}`}>
                <input type="checkbox" checked={signals.includes(s.id)} onChange={() => toggle(s.id)} disabled={!active} />
                {s.label}
              </label>
            ))}
            <label className={`check ${noneConfirmed ? '' : ''}`} style={noneConfirmed ? { borderColor: 'var(--good-line)', background: 'var(--good-bg)' } : undefined}>
              <input type="checkbox" style={{ accentColor: 'var(--good)' }} checked={noneConfirmed} onChange={(e) => { setNoneConfirmed(e.target.checked); if (e.target.checked) setSignals([]); }} disabled={!active} />
              None of the above
            </label>
          </div>
          {active && (
            <>
              <div className="row wrap" style={{ marginTop: 4 }}>
                <button className="btn danger" onClick={report} disabled={!signals.length}><Icon name="octagon" size={14} /> Report signal now</button>
                <span className="small muted">Reports without stopping the session.</span>
              </div>
              <hr className="divider" style={{ margin: '8px 0' }} />
              <div className="row wrap" style={{ alignItems: 'flex-end' }}>
                <div className="field">
                  <span className="label">Tolerance (0 = fine, 3 = poor)</span>
                  <div className="scale" style={{ width: 200 }}>
                    {[0, 1, 2, 3].map((n) => <button key={n} aria-pressed={tolerance === n} onClick={() => setTolerance(n)}>{n}</button>)}
                  </div>
                </div>
                <div className="field" style={{ flex: 1, minWidth: 180 }}>
                  <label htmlFor="notes">Notes</label>
                  <input id="notes" className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
                </div>
                <button className="btn" onClick={stop} disabled={!signals.length && !noneConfirmed} title={!signals.length && !noneConfirmed ? 'Answer the safety checklist first' : ''}>
                  <Icon name="stop" size={13} /> Stop and save
                </button>
              </div>
            </>
          )}
          {!active && <p className="small muted">The checklist becomes active once a session is running.</p>}
        </div>
      </div>
    </Panel>
  );
}
