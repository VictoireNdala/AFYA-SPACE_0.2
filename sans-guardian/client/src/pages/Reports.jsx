import { useState } from 'react';
import { useApi, useApp } from '../lib/live.jsx';
import Icon from '../components/Icon.jsx';
import { Panel, CrewPicker, Empty } from '../components/chrome.jsx';
import { dayLabel, signed, fixed, pct } from '../lib/format.js';

const LABEL = { OCT_RETINAL_THICKNESS: 'Total retinal thickness (OCT)', REFRACTION: 'Refraction', IOP: 'Intraocular pressure' };

export default function Reports() {
  const { selected, setSelected } = useApp();
  const [kind, setKind] = useState('individual');
  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="row wrap no-print" style={{ gap: 12 }}>
        <div className="seg" role="group" aria-label="Report type">
          <button aria-pressed={kind === 'individual'} onClick={() => setKind('individual')}>Individual report</button>
          <button aria-pressed={kind === 'crew'} onClick={() => setKind('crew')}>Crew report</button>
        </div>
        {kind === 'individual' && <CrewPicker value={selected} onChange={setSelected} />}
        <span style={{ flex: 1 }} />
        <button className="btn primary" onClick={() => window.print()}><Icon name="printer" size={14} /> Print / save as PDF</button>
      </div>
      {kind === 'individual' ? <IndividualReport code={selected} /> : <CrewReport />}
    </div>
  );
}

function Header({ title, sub, r }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: '#52514e', fontWeight: 600 }}>SANS GUARDIAN · CREW MONITORING</div>
          <h1 style={{ marginTop: 6 }}>{title}</h1>
          <p className="r-sub">{sub}</p>
        </div>
        <img src="/favicon.svg" alt="" width="44" height="44" />
      </div>
      <p className="r-note" style={{ marginTop: 10 }}>
        Mission day {dayLabel(r.mission.day)} ({r.mission.phase}) · launch {r.mission.launchDate} · {r.mission.missionDays}-day mission · generated {new Date(r.generatedAt).toLocaleString('en-GB')}
      </p>
      <div className="r-warn" style={{ marginTop: 14 }}>
        <b>Research prototype. Not a medical device. Simulated data.</b> This report summarises monitoring data for the flight surgeon. It does not diagnose, prescribe or choose doses.
      </div>
    </>
  );
}

/** Print-friendly retinal trend (light theme, pure SVG). */
function ReportChart({ points, watch, urgent, landing = 180 }) {
  const W = 760;
  const H = 180;
  const P = { l: 40, r: 16, t: 12, b: 24 };
  if (!points.length) return null;
  const x0 = -90;
  const x1 = 360;
  const ys = [...points.map((p) => p.delta), urgent ?? 0, 0];
  const y0 = Math.min(...ys) - 4;
  const y1 = Math.max(...ys) + 4;
  const sx = (x) => P.l + ((x - x0) / (x1 - x0)) * (W - P.l - P.r);
  const sy = (y) => P.t + (1 - (y - y0) / (y1 - y0)) * (H - P.t - P.b);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.day).toFixed(1)},${sy(p.delta).toFixed(1)}`).join(' ');
  const ticks = [-90, 0, 90, 180, 270, 360];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Retinal thickness change over the mission">
      {[y0, 0, y1].map((y, i) => <line key={i} x1={P.l} x2={W - P.r} y1={sy(y)} y2={sy(y)} stroke={y === 0 ? '#c3c2b7' : '#e1e0d9'} />)}
      {watch != null && <line x1={P.l} x2={W - P.r} y1={sy(watch)} y2={sy(watch)} stroke="#c98500" strokeDasharray="4 4" />}
      {urgent != null && <line x1={P.l} x2={W - P.r} y1={sy(urgent)} y2={sy(urgent)} stroke="#d03b3b" strokeDasharray="4 4" />}
      {[0, landing].map((x) => <line key={x} x1={sx(x)} x2={sx(x)} y1={P.t} y2={H - P.b} stroke="#c3c2b7" />)}
      {watch != null && <text x={W - P.r} y={sy(watch) - 4} fontSize="10" fill="#52514e" textAnchor="end">Watch {watch} µm (demo)</text>}
      {urgent != null && <text x={W - P.r} y={sy(urgent) - 4} fontSize="10" fill="#52514e" textAnchor="end">Urgent {urgent} µm (demo)</text>}
      <path d={d} fill="none" stroke="#2d6aa8" strokeWidth="2" strokeLinejoin="round" />
      {points.map((p) => <circle key={p.day} cx={sx(p.day)} cy={sy(p.delta)} r="2.4" fill="#2d6aa8" />)}
      {ticks.map((t) => <text key={t} x={sx(t)} y={H - 6} fontSize="10" fill="#898781" textAnchor="middle">{t === 0 ? 'Launch' : dayLabel(t, landing)}</text>)}
      <text x={6} y={sy(0) + 3} fontSize="10" fill="#898781">0 µm</text>
    </svg>
  );
}

function IndividualReport({ code }) {
  const { data: r } = useApi(`/reports/${code}`);
  const { state } = useApp();
  if (!r) return <Panel><Empty>Building report…</Empty></Panel>;
  const th = state?.protocol?.thresholds?.RETINA_DELTA_UM;
  const s = r.summary;
  const signalLabel = (id) => state?.protocol?.safetySignals?.find((x) => x.id === id)?.label ?? id;
  return (
    <article className="report">
      <Header title={`End-of-mission report · ${r.astronaut.code}`} sub={`${r.astronaut.role} · individual SANS monitoring summary`} r={r} />

      <h2>Summary</h2>
      <div className="r-grid">
        <div className="r-stat"><span>Follow-up priority</span><b>{r.risk.score}/100</b> <span>{r.risk.level}</span></div>
        <div className="r-stat"><span>Retinal thickness, latest</span><b>{signed(s.retina?.delta, 1)} µm</b><span>peak {signed(s.peakRetinaDelta, 1)} µm</span></div>
        <div className="r-stat"><span>Refraction, latest</span><b>{signed(s.refraction?.delta, 2)} D</b><span>vs pre-flight baseline</span></div>
        <div className="r-stat"><span>B-vitamin adherence</span><b>{pct(r.adherence.all)}</b><span>30 days: {pct(r.adherence.d30)}</span></div>
        <div className="r-stat"><span>Alerts</span><b>{s.alertsByLevel.URGENT} urgent</b><span>{s.alertsByLevel.WATCH} watch · {s.alertsByLevel.INFO} info</span></div>
        <div className="r-stat"><span>Countermeasure sessions</span><b>{s.sessionCounts.THIGH_CUFF + s.sessionCounts.LBNP}</b><span>{s.sessionCounts.THIGH_CUFF} thigh cuff · {s.sessionCounts.LBNP} LBNP</span></div>
        <div className="r-stat"><span>Days with vision symptoms</span><b>{s.symptomDays}</b><span>of {s.loggedDays} logged days</span></div>
        <div className="r-stat"><span>Recovery</span><b>{r.recovery.started ? `${r.recovery.recoveredPct ?? '–'}%` : 'Not started'}</b><span>{r.recovery.persistent ? 'persistent change flagged' : 'toward baseline'}</span></div>
      </div>

      <h2>Retinal thickness change over the mission</h2>
      <ReportChart points={r.trends.OCT_RETINAL_THICKNESS.points.filter((p) => p.delta != null)} watch={th?.watch} urgent={th?.urgent} landing={r.mission.landingDay} />

      <h2>Measurements vs pre-flight baseline</h2>
      <table>
        <thead><tr><th>Measure</th><th>Baseline</th><th>Latest</th><th>Change</th><th>Measured</th></tr></thead>
        <tbody>
          {Object.entries(r.trends).map(([type, t]) => {
            const last = t.points.at(-1);
            const dec = type === 'REFRACTION' ? 2 : 1;
            return (
              <tr key={type}><td>{LABEL[type]}</td><td>{fixed(t.baseline, dec)} {t.unit}</td><td>{last ? `${fixed(last.value, dec)} ${t.unit}` : '–'}</td><td>{last ? `${signed(last.delta, dec)} ${t.unit}` : '–'}</td><td>{last ? dayLabel(last.day) : '–'}</td></tr>
            );
          })}
        </tbody>
      </table>

      <h2>Follow-up priority: factors</h2>
      <table>
        <thead><tr><th>Factor</th><th>Contribution</th><th>Detail</th></tr></thead>
        <tbody>{r.risk.factors.map((f) => <tr key={f.id}><td>{f.label}</td><td>{f.contribution.toFixed(1)} / {f.max}</td><td>{f.detail}</td></tr>)}</tbody>
      </table>
      <p className="r-note" style={{ marginTop: 6 }}>{r.risk.disclaimer}</p>

      <h2>Alerts</h2>
      {r.alerts.length === 0 ? <p className="r-note">No alert.</p> : (
        <table>
          <thead><tr><th>Level</th><th>Day</th><th>Details</th><th>Status</th></tr></thead>
          <tbody>{r.alerts.map((a) => <tr key={a.id}><td className={`lvl-${a.level}`}>{a.level}</td><td>{dayLabel(a.day)}</td><td>{a.message}</td><td>{a.acked ? `Ack. ${a.ackedBy ?? ''}` : 'Open'}</td></tr>)}</tbody>
        </table>
      )}

      <h2>Countermeasure sessions</h2>
      {r.sessions.length === 0 ? <p className="r-note">No session.</p> : (
        <table>
          <thead><tr><th>Day</th><th>Type</th><th>Duration</th><th>Tolerance</th><th>Safety signals</th></tr></thead>
          <tbody>{r.sessions.map((x) => <tr key={x.id}><td>{dayLabel(x.day)}</td><td>{x.type === 'LBNP' ? 'LBNP' : 'Thigh cuffs'}</td><td>{x.status === 'active' ? 'In progress' : `${Math.round(x.minutes)} min`}</td><td>{x.tolerance ?? '–'}</td><td>{x.signals.length ? x.signals.map(signalLabel).join(', ') : 'None'}</td></tr>)}</tbody>
        </table>
      )}

      <h2>Exams and spare glasses</h2>
      <table>
        <thead><tr><th>Exam</th><th>Scheduled</th><th>Status</th></tr></thead>
        <tbody>{r.exams.map((e) => <tr key={e.day}><td>{e.label}</td><td>{dayLabel(e.day)}</td><td>{e.status}</td></tr>)}</tbody>
      </table>
      {r.glasses?.suggestion && <p className="r-note" style={{ marginTop: 8 }}>Spare glasses: closest pair {r.glasses.suggestion.id} ({signed(r.glasses.suggestion.power, 2)} D) for a measured refraction of {signed(r.glasses.measured, 2)} D. {r.glasses.note}</p>}

      <h2>Post-flight recovery</h2>
      {r.recovery.started ? (
        <table>
          <thead><tr><th>Checkpoint</th><th>Retinal thickness change</th></tr></thead>
          <tbody>
            <tr><td>Landing</td><td>{signed(r.recovery.landingDelta, 1)} µm</td></tr>
            {r.recovery.milestones.map((m) => <tr key={m.label}><td>{m.label}</td><td>{m.delta != null ? `${signed(m.delta, 1)} µm` : m.reached ? 'Not recorded' : 'Upcoming'}</td></tr>)}
          </tbody>
        </table>
      ) : <p className="r-note">Recovery tracking starts after landing (R+30, R+90, R+6 months).</p>}

      <h2>Limitations</h2>
      <ul className="r-note" style={{ paddingLeft: 18, margin: 0 }}>{r.disclaimers.map((d) => <li key={d} style={{ marginBottom: 4 }}>{d}</li>)}</ul>
    </article>
  );
}

function CrewReport() {
  const { data: r } = useApi('/reports/crew');
  if (!r) return <Panel><Empty>Building report…</Empty></Panel>;
  const t = r.totals;
  return (
    <article className="report">
      <Header title="End-of-mission report · Crew" sub="Global SANS monitoring summary for the flight surgeons" r={r} />
      <h2>Crew summary</h2>
      <div className="r-grid">
        <div className="r-stat"><span>Crew size</span><b>{t.crewSize}</b></div>
        <div className="r-stat"><span>High follow-up priority</span><b>{t.highRisk}</b></div>
        <div className="r-stat"><span>Open alerts</span><b>{t.openUrgent} urgent</b><span>{t.openWatch} watch</span></div>
        <div className="r-stat"><span>Mean adherence, 30 days</span><b>{t.meanAdherence30}%</b></div>
      </div>
      <h2>By astronaut</h2>
      <table>
        <thead><tr><th>Astronaut</th><th>Role</th><th>Priority</th><th>Retina change</th><th>Refraction change</th><th>IOP</th><th>Adherence 30 d</th><th>Open alerts</th><th>Exams overdue</th></tr></thead>
        <tbody>
          {r.crew.map((c) => (
            <tr key={c.code}>
              <td><b>{c.code}</b></td><td>{c.role}</td><td>{c.risk.score} ({c.risk.level})</td><td>{signed(c.retina.delta, 1)} µm</td><td>{signed(c.refraction.delta, 2)} D</td><td>{fixed(c.iop.value, 1)} mmHg</td><td>{pct(c.adherence30)}</td>
              <td>{c.alerts.URGENT ? <span className="lvl-URGENT">{c.alerts.URGENT} urgent</span> : null} {c.alerts.WATCH ? <span className="lvl-WATCH">{c.alerts.WATCH} watch</span> : null} {!c.alerts.URGENT && !c.alerts.WATCH ? 'None' : ''}</td>
              <td>{c.examsOverdue}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2>Limitations</h2>
      <ul className="r-note" style={{ paddingLeft: 18, margin: 0 }}>
        <li>Research prototype. Not a medical device. Simulated data.</li>
        <li>SANS has no established treatment and its exact cause is unknown. Countermeasures are NASA research avenues, not proven treatments.</li>
        <li>Scores and thresholds are demo values, not clinically validated.</li>
      </ul>
    </article>
  );
}
