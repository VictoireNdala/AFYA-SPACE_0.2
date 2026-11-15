import { useEffect, useState } from 'react';
import { useApi, useApp } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Panel, CrewPicker, Empty } from '../components/chrome.jsx';
import { ChartFrame, C } from '../charts/core.jsx';
import { TwoLines } from '../charts/live.jsx';
import { Meter } from '../charts/small.jsx';
import { dayLabel } from '../lib/format.js';

const QUESTIONS = [
  ['blurry', 'Blurry vision'],
  ['near', 'Difficulty reading up close'],
  ['far', 'Difficulty seeing far away'],
  ['change', 'Change since yesterday'],
];
const MOODS = [
  ['Low', 'sad', 1],
  ['So-so', 'meh', 2],
  ['Good', 'smile', 3],
  ['Great', 'laugh', 4],
];

export default function DailyLog() {
  const { selected, setSelected } = useApp();
  const { data } = useApi(`/astronauts/${selected}`);
  return (
    <div className="grid" style={{ gap: 20 }}>
      <CrewPicker value={selected} onChange={setSelected} />
      <div className="grid g-12">
        <VisionLog code={selected} data={data} />
        <Wellbeing code={selected} data={data} />
      </div>
      <div className="grid g-12">
        <Exercise />
        <BoneModel />
      </div>
    </div>
  );
}

function VisionLog({ code, data }) {
  const blank = { blurry: 0, near: 0, far: 0, change: 0, venous: false, notes: '' };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    setF(blank);
    setMsg('');
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = async (e) => {
    e.preventDefault();
    try {
      const r = await post('/logs/vision', { code, ...f });
      setMsg(f.venous ? 'Saved. An URGENT alert was sent to the flight surgeon.' : r.message);
      setF(blank);
    } catch (err) {
      setMsg(err.message);
    }
  };
  const today = data?.mission?.day;
  const already = data?.symptoms?.some((s) => s.day === today);
  return (
    <Panel className="span-7" title="Daily vision log" subtitle={`Under a minute. 0 = not at all, 3 = a lot.${today != null ? ` ${dayLabel(today)}.` : ''}`} actions={already && <span className="badge good"><Icon name="tick" size={12} /> Logged today</span>}>
      <form onSubmit={save} className="stack" style={{ gap: 16 }}>
        {QUESTIONS.map(([k, label]) => (
          <div key={k} className="row between wrap">
            <span>{label}</span>
            <div className="scale" style={{ width: 240 }} role="group" aria-label={label}>
              {[0, 1, 2, 3].map((n) => (
                <button type="button" key={n} aria-pressed={f[k] === n} onClick={() => setF({ ...f, [k]: n })}>{n}</button>
              ))}
            </div>
          </div>
        ))}
        <label className={`check ${f.venous ? 'on' : ''}`}>
          <input type="checkbox" checked={f.venous} onChange={(e) => setF({ ...f, venous: e.target.checked })} />
          Pain, swelling or redness in an arm, a leg or the neck
        </label>
        <input className="input" placeholder="Notes (optional)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} aria-label="Notes" />
        <div className="row between wrap">
          <p className="small soft" style={{ maxWidth: '52ch' }}><Icon name="info" size={12} /> Having no symptoms does not rule out SANS. Your log is reviewed together with OCT and other measurements.</p>
          <button className="btn primary" type="submit"><Icon name="tick" size={14} /> Save log</button>
        </div>
        {msg && <p className="small" style={{ color: f.venous ? 'var(--critical-ink)' : undefined }}>{msg}</p>}
      </form>
    </Panel>
  );
}

function Wellbeing({ code, data }) {
  const [mood, setMood] = useState(3);
  const [stress, setStress] = useState(4);
  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(false), [code]);
  const week = (data?.wellbeing ?? []).slice(-14);
  const save = () => post('/logs/wellbeing', { code, mood, stress }).then(() => setSaved(true)).catch(() => {});
  let suggestion = 'A shared crew meal tonight could be a good moment together.';
  if (mood <= 1 || stress >= 7) suggestion = 'Consider a break, or a talk with the crew medical officer or the ground support team.';
  else if (mood <= 2 || stress >= 5) suggestion = 'A short crew activity or a call home might help.';
  return (
    <Panel className="span-5" title="Wellbeing check-in" subtitle="Mood and stress: the mental-health part of the daily check-in.">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {MOODS.map(([label, icon, v]) => (
          <button key={label} className="chip" style={{ flexDirection: 'column', borderRadius: 12, padding: '10px 0', justifyContent: 'center' }} aria-pressed={mood === v} onClick={() => setMood(v)}>
            <Icon name={icon} size={22} />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <span className="soft" style={{ width: 54 }}>Stress</span>
        <input type="range" min="0" max="10" value={stress} onChange={(e) => setStress(Number(e.target.value))} style={{ flex: 1, '--fill': `${stress * 10}%` }} aria-label="Stress level" />
        <b className="num" style={{ width: 24, textAlign: 'right' }}>{stress}</b>
      </div>
      <div className="row between" style={{ marginTop: 12 }}>
        <p className="small soft" style={{ maxWidth: '36ch' }}><Icon name="bulb" size={12} /> {suggestion}</p>
        <button className="btn sm" onClick={save}>{saved ? 'Saved' : 'Save check-in'}</button>
      </div>
      <hr className="divider" />
      <ChartFrame title="Mood, last 14 days" subtitle="1 = low, 4 = great. Today highlighted.">
        {week.length ? (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 90, paddingTop: 6 }}>
            {week.map((w, i) => (
              <div key={w.day} title={`${dayLabel(w.day)}: mood ${w.mood}, stress ${w.stress}`} style={{ flex: 1, display: 'grid', justifyItems: 'center', gap: 4, height: '100%', alignContent: 'end' }}>
                <span style={{ width: '100%', maxWidth: 22, height: `${(w.mood / 4) * 70}px`, borderRadius: '4px 4px 0 0', background: i === week.length - 1 ? C.series1 : C.contextBar, transition: 'height .6s' }} />
                <span className="mono" style={{ fontSize: 9, color: C.muted }}>{i % 3 === 0 || i === week.length - 1 ? dayLabel(w.day) : ''}</span>
              </div>
            ))}
          </div>
        ) : <Empty>No check-ins yet for this period.</Empty>}
      </ChartFrame>
    </Panel>
  );
}

const PROGRAM = [
  { id: 'treadmill', title: 'Treadmill with harness', duration: '30 min' },
  { id: 'resistance', title: 'Resistance (squats, press)', duration: '45 min' },
  { id: 'bike', title: 'Cycle ergometer', duration: '30 min', when: '18:00' },
];

function Exercise() {
  const [done, setDone] = useState({ treadmill: true });
  const count = Object.values(done).filter(Boolean).length;
  const firstTodo = PROGRAM.find((p) => !done[p.id])?.id;
  return (
    <Panel className="span-5" title="Today's exercise" subtitle="Tap a session when it is done.">
      <div className="list">
        {PROGRAM.map((p) => {
          const isDone = !!done[p.id];
          const current = p.id === firstTodo;
          return (
            <button key={p.id} className="list-item" style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--hair)', textAlign: 'left', width: '100%', color: 'inherit' }} onClick={() => setDone({ ...done, [p.id]: !isDone })}>
              <span style={{ color: isDone ? 'var(--good)' : current ? C.text : C.muted }}><Icon name={isDone ? 'check' : current ? 'play' : 'clock'} size={18} /></span>
              <span className="grow">
                <span className="title" style={{ display: 'block' }}>{p.title}</span>
                <span className="sub">{p.duration}{isDone ? ', done' : p.when ? `, ${p.when}` : ', to do'}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="stack" style={{ marginTop: 16, gap: 12 }}>
        <Meter label="Sessions completed today" value={count} max={PROGRAM.length} display={`${count} / ${PROGRAM.length}`} />
      </div>
    </Panel>
  );
}

// Illustrative model only: NOT calibrated, kept to show what a crew "digital twin" view could look like.
const density = (day, hoursPerWeek) => 100 * (1 - 0.0003 * day * Math.max(0.04, 1 - 0.08 * hoursPerWeek));

function BoneModel() {
  const [mission, setMission] = useState(540);
  const [hours, setHours] = useState(6);
  const data = [];
  for (let d = 0; d <= 900; d += 30) data.push({ d, with: density(d, hours), without: density(d, 0) });
  const est = density(mission, hours);
  return (
    <Panel className="span-7">
      <ChartFrame
        title="Bone density projection (illustrative)"
        subtitle="What-if view: mission length and weekly exercise. The curve is an uncalibrated illustration, not a prediction."
        legend={<><span><i className="key-line" style={{ background: C.series1 }} />With {hours} h/week</span><span><i className="key-line" style={{ background: C.series2 }} />Without exercise</span></>}
        footer={<span>Illustrative model · not derived from NASA data · not for decisions</span>}
      >
        <div className="grid g-2" style={{ gap: 14 }}>
          <div className="row"><span className="soft" style={{ width: 70 }}>Mission</span><input type="range" min="60" max="900" step="10" value={mission} onChange={(e) => setMission(Number(e.target.value))} style={{ flex: 1, '--fill': `${((mission - 60) / 840) * 100}%` }} aria-label="Mission length in days" /><b className="num" style={{ width: 58, textAlign: 'right' }}>{mission} d</b></div>
          <div className="row"><span className="soft" style={{ width: 70 }}>Exercise</span><input type="range" min="0" max="14" value={hours} onChange={(e) => setHours(Number(e.target.value))} style={{ flex: 1, '--fill': `${(hours / 14) * 100}%` }} aria-label="Exercise hours per week" /><b className="num" style={{ width: 58, textAlign: 'right' }}>{hours} h/wk</b></div>
        </div>
        <TwoLines data={data} xKey="d" xFormat={(d) => `Day ${d}`} a={{ key: 'with', label: 'With exercise' }} b={{ key: 'without', label: 'Without' }} yDomain={[70, 100]} marker={mission} />
        <p className="small soft">At day {mission}: <b style={{ color: C.text }}>{est.toFixed(1)}%</b> of starting density in this illustration.</p>
      </ChartFrame>
    </Panel>
  );
}
