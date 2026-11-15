import { useMemo, useState } from 'react';
import { useApi, useApp, useStream } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import Icon, { RiskBadge, LevelBadge } from '../components/Icon.jsx';
import { Panel, CrewPicker, Empty } from '../components/chrome.jsx';
import { ChartFrame, LegendLine, LegendBox, C } from '../charts/core.jsx';
import TrendChart from '../charts/TrendChart.jsx';
import { ContributionBars, SymptomStrip } from '../charts/small.jsx';
import { LiveLine } from '../charts/live.jsx';
import { dayLabel, signed, fixed } from '../lib/format.js';

const TYPE_ORDER = ['OCT_RETINAL_THICKNESS', 'REFRACTION', 'IOP'];

function trendProps(t, type) {
  const isValue = t.mode === 'value';
  const pts = t.points.map((p) => ({ day: p.day, y: isValue ? p.value : p.delta }));
  const context = Object.fromEntries(Object.entries(t.crew).map(([c, ps]) => [c, ps.map((p) => ({ day: p.day, y: isValue ? p.value : p.delta }))]));
  const th = [];
  if (t.thresholds?.watch != null) th.push({ level: 'WATCH', value: t.thresholds.watch });
  if (t.thresholds?.urgent != null) th.push({ level: 'URGENT', value: t.thresholds.urgent });
  return { points: pts, context, thresholds: th, unit: t.unit, decimals: type === 'REFRACTION' ? 2 : 1, signedValues: !isValue, showBaseline: !isValue };
}

function tableFor(t, decimals) {
  return {
    columns: [
      { key: 'day', label: 'Mission day', format: (v) => dayLabel(v) },
      { key: 'value', label: `Value (${t.unit})`, num: true, format: (v) => fixed(v, decimals) },
      { key: 'delta', label: 'Change vs baseline', num: true, format: (v) => signed(v, decimals) },
      { key: 'source', label: 'Source' },
    ],
    rows: t.points.slice().reverse(),
  };
}

export default function Astronaut() {
  const { selected, setSelected } = useApp();
  const { data } = useApi(`/astronauts/${selected}`);
  // Memoised so charts keep stable data (and finish their animation) between unrelated re-renders.
  const charts = useMemo(() => (data ? Object.fromEntries(TYPE_ORDER.map((t) => [t, trendProps(data.trends[t], t)])) : null), [data]);
  const annotations = useMemo(() => (data ? data.alerts.filter((a) => a.rule === 'RETINA_DELTA_UM').sort((a, b) => a.day - b.day).slice(-1).map((a) => ({ day: a.day, y: a.value, level: a.level, label: `Alert: ${a.level === 'URGENT' ? 'urgent' : 'watch'}` })) : []), [data]);
  if (!data) return <Panel><Empty>Loading astronaut data…</Empty></Panel>;

  const { risk, trends, mission } = data;
  const retina = trends.OCT_RETINAL_THICKNESS;

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="row between wrap">
        <CrewPicker value={selected} onChange={setSelected} />
        <div className="row">
          <span className="soft small">{data.astronaut.role} · {data.astronaut.sex === 'F' ? 'Female' : 'Male'}</span>
          <RiskBadge level={risk.level} score={risk.score} />
        </div>
      </div>

      <div className="grid g-12">
        <Panel className="span-4" title="Follow-up priority" subtitle="Transparent score: each factor shows its contribution.">
          <div className="row" style={{ alignItems: 'baseline', gap: 12, marginBottom: 18 }}>
            <span className="hero-figure">{risk.score}</span>
            <span className="soft">/ 100</span>
            <span style={{ marginLeft: 'auto' }}><RiskBadge level={risk.level} /></span>
          </div>
          <ContributionBars factors={risk.factors} />
          {data.model?.risk_probability != null && (
            <div className="stack" style={{ gap: 6, marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--hair)' }}>
              <div className="row between">
                <span className="eyebrow">Prediction model · {data.model.bestModel}</span>
                <span className={`badge ${{ Low: 'low', Moderate: 'moderate', High: 'high' }[data.model.risk_level]}`}>{Math.round(data.model.risk_probability * 100)}% · {data.model.risk_level}</span>
              </div>
              <span className="small soft">{data.model.top_factors || 'No dominant factor'}</span>
              <span className="small muted">Estimated probability of significant change by end of mission, from the first 60 days (data up to FD {data.model.scoredUpToDay}). Trained on simulated missions.</span>
            </div>
          )}
          <p className="footnote"><Icon name="lock" size={12} /> Genetic data {data.astronaut.consentGenetics ? 'encrypted at rest, consent given' : 'not used: no consent recorded'}. {risk.disclaimer}</p>
        </Panel>

        <Panel className="span-8">
          <ChartFrame
            title={retina.label}
            subtitle={`Change vs pre-flight baseline (${fixed(retina.baseline, 1)} µm). ${selected} highlighted against the rest of the crew.`}
            legend={<><LegendLine color={C.series1} label={selected} /><LegendLine color={C.contextHover} label="Rest of crew" /><LegendLine color={C.warning} label="Watch" dashed /><LegendLine color={C.critical} label="Urgent" dashed /></>}
            table={tableFor(retina, 1)}
            footer={<span>Source: simulated onboard and ground OCT · first changes are expected around flight day 30 (NASA) · thresholds are demo values</span>}
          >
            <TrendChart name={selected} today={mission.day} annotations={annotations} {...charts.OCT_RETINAL_THICKNESS} />
            <div className="row between small" style={{ marginTop: -2 }}>
              <span className="soft">Self-reported blurry vision (daily log, 0 to 3)</span>
              <span className="legend">
                <LegendBox color={C.zero} label="0" />
                {C.seq.slice(1).map((c, i) => <LegendBox key={c} color={c} label={String(i + 1)} />)}
              </span>
            </div>
            <SymptomStrip symptoms={data.symptoms} today={mission.day} />
            <p className="small muted" style={{ marginTop: 4 }}><Icon name="info" size={12} /> SANS can be present without symptoms the astronaut notices. Measurements and the daily log are always reviewed together.</p>
          </ChartFrame>
        </Panel>
      </div>

      <div className="grid g-2">
        {TYPE_ORDER.slice(1).map((type) => {
          const t = trends[type];
          const props = charts[type];
          return (
            <Panel key={type}>
              <ChartFrame
                title={t.label}
                subtitle={t.mode === 'value' ? `Measured value (${t.unit}). Pre-flight baseline ${fixed(t.baseline, 1)} ${t.unit}.` : `Change vs pre-flight baseline (${fixed(t.baseline, 2)} ${t.unit}). NASA reports changes of up to ~1.5 D.`}
                legend={<><LegendLine color={C.series1} label={selected} /><LegendLine color={C.contextHover} label="Rest of crew" /></>}
                table={tableFor(t, props.decimals)}
                footer={<span>Simulated data · thresholds are demo values</span>}
              >
                <TrendChart name={`${selected}${type}`} today={mission.day} height={220} {...props} />
              </ChartFrame>
            </Panel>
          );
        })}
      </div>

      <div className="grid g-12">
        <LiveVitals code={selected} />

        <ExamsPanel data={data} />
        <GlassesPanel data={data} />
      </div>

      <div className="grid g-12">
        <RecoveryPanel data={data} />
        <Panel className="span-5" title="Venous safety signals" subtitle="From daily logs and countermeasure sessions. Every signal raises an URGENT alert.">
          {data.venous.length === 0 && <Empty>No venous signal reported.</Empty>}
          <div className="list">
            {data.venous.map((v, i) => (
              <div key={i} className="list-item">
                <LevelBadge level="URGENT" />
                <div className="grow">
                  <div className="title">{v.source} · {dayLabel(v.day)}</div>
                  <div className="sub">{v.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <hr className="divider" />
          <div className="eyebrow" style={{ marginBottom: 6 }}>Return-to-Earth plan (set by the medical team)</div>
          <p className="soft small">{data.returnProtocol}</p>
        </Panel>
      </div>
    </div>
  );
}

function ExamsPanel({ data }) {
  const [type, setType] = useState('OCT_RETINAL_THICKNESS');
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  const save = async (e) => {
    e.preventDefault();
    try {
      await post('/measurements', { code: data.astronaut.code, type, value: Number(value) });
      setMsg('Saved locally and queued for downlink.');
      setValue('');
    } catch (err) {
      setMsg(err.message);
    }
  };
  const icon = { done: 'check', overdue: 'alert', due: 'clock', upcoming: 'circle' };
  const cls = { done: 'good', overdue: 'watch', due: 'info', upcoming: 'neutral' };
  return (
    <Panel className="span-4" title="Exam calendar" subtitle="OCT, intraocular pressure, visual field.">
      <div className="list" style={{ maxHeight: 250, overflowY: 'auto' }}>
        {data.exams.map((e) => (
          <div key={e.day} className="list-item" style={{ padding: '7px 2px' }}>
            <span className={`badge ${cls[e.status]}`}><Icon name={icon[e.status]} size={12} /> {e.status[0].toUpperCase() + e.status.slice(1)}</span>
            <div className="grow"><div className="title" style={{ fontSize: 13 }}>{e.label}</div></div>
            <span className="mono small muted">{dayLabel(e.day)}</span>
          </div>
        ))}
      </div>
      <hr className="divider" />
      <form onSubmit={save} className="stack">
        <div className="eyebrow">Record an onboard result</div>
        <div className="row">
          <select className="input" value={type} onChange={(e) => setType(e.target.value)} aria-label="Measurement type">
            <option value="OCT_RETINAL_THICKNESS">OCT (µm)</option>
            <option value="REFRACTION">Refraction (D)</option>
            <option value="IOP">IOP (mmHg)</option>
          </select>
          <input className="input" style={{ maxWidth: 100 }} type="number" step="0.01" required value={value} onChange={(e) => setValue(e.target.value)} placeholder="Value" aria-label="Value" />
          <button className="btn primary" type="submit">Save</button>
        </div>
        {msg && <span className="small soft">{msg}</span>}
      </form>
    </Panel>
  );
}

function GlassesPanel({ data }) {
  const g = data.glasses;
  if (!g) return <Panel className="span-4" title="Spare glasses"><Empty>No refraction measured yet.</Empty></Panel>;
  const issue = () => post('/glasses/issue', { code: data.astronaut.code, glassesId: g.suggestion.id, by: 'Flight surgeon' }).catch(() => {});
  return (
    <Panel className="span-4" title="Spare glasses" subtitle="Closest pair to the latest measured refraction.">
      <div className="row" style={{ gap: 18, alignItems: 'flex-end' }}>
        <div>
          <div className="eyebrow">Measured</div>
          <div className="stat-value">{signed(g.measured, 2)}<small>D</small></div>
          <div className="small muted">{dayLabel(g.measuredDay)} · {signed(g.delta, 2)} D vs baseline</div>
        </div>
        <Icon name="chevron" size={18} className="muted" />
        <div>
          <div className="eyebrow">Suggested pair</div>
          <div className="stat-value">{g.suggestion ? `${signed(g.suggestion.power, 2)}` : '–'}<small>D</small></div>
          <div className="small muted">{g.suggestion ? `${g.suggestion.id} · ${g.suggestion.available} available` : 'None available'}</div>
        </div>
      </div>
      <p className="small" style={{ marginTop: 12, color: 'var(--warning-ink)' }}><Icon name="alert" size={12} /> {g.note}</p>
      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn sm" onClick={issue} disabled={!g.suggestion}><Icon name="glasses" size={13} /> Record as issued</button>
        {g.issued && <span className="small soft">Issued {g.issued.glasses_id} on {dayLabel(g.issued.day)}</span>}
      </div>
      <hr className="divider" />
      <div className="eyebrow" style={{ marginBottom: 8 }}>Onboard inventory</div>
      <div className="chips">
        {g.inventory.map((p) => (
          <span key={p.id} className="badge neutral" style={p.id === g.suggestion?.id ? { borderColor: 'var(--text)', color: 'var(--text)' } : undefined}>
            {signed(p.power, 2)} D · {p.available}
          </span>
        ))}
      </div>
    </Panel>
  );
}

function RecoveryPanel({ data }) {
  const r = data.recovery;
  const points = r.points.map((p) => ({ day: p.day, y: p.delta }));
  return (
    <Panel className="span-7">
      <ChartFrame
        title="Post-flight recovery"
        subtitle="Retinal thickness change after landing, with the R+30, R+90 and R+6 months checks. NASA: often improves between 90 days and 6 months, some changes persist."
        footer={<span>Persistent-change flag above {r.threshold} µm at R+150 or later (demo value)</span>}
      >
        {!r.started ? (
          <div className="stack" style={{ padding: '18px 0' }}>
            <p className="soft">Recovery tracking starts after landing. Move the mission clock past landing to see it.</p>
            <div className="row wrap">{r.milestones.map((m) => <span key={m.label} className="badge neutral"><Icon name="calendar" size={12} /> {m.label} · {dayLabel(m.day)}</span>)}</div>
            {r.landingDelta != null && <p className="small muted">Latest in-flight change: {signed(r.landingDelta, 1)} µm.</p>}
          </div>
        ) : (
          <>
            <div className="row wrap" style={{ marginBottom: 6 }}>
              <span className="badge neutral">At landing {signed(r.landingDelta, 1)} µm</span>
              <span className="badge neutral">Now {signed(r.currentDelta, 1)} µm</span>
              {r.recoveredPct != null && <span className="badge info">{r.recoveredPct}% back toward baseline</span>}
              {r.persistent && <span className="badge watch"><Icon name="alert" size={12} /> Persistent change</span>}
            </div>
            <TrendChart
              name={`${data.astronaut.code}rec`}
              points={points}
              unit="µm"
              thresholds={[{ level: 'WATCH', value: r.threshold }]}
              domainX={[170, 365]}
              ticks={[180, 210, 270, 360]}
              today={data.mission.day}
              height={210}
            />
          </>
        )}
      </ChartFrame>
    </Panel>
  );
}

function LiveVitals({ code }) {
  const { history, vitals } = useStream();
  const selected = code;
  const live = vitals.find((v) => v.code === code);
  return (
    <Panel className="span-4" title="Live vitals" subtitle="Wearable stream, 1 sample per second (simulated).">
      {live ? (
        <>
          <LiveLine data={history[selected] ?? []} dataKey="hr" baseline={live.baseline.hr} unit="bpm" label="Heart rate" />
          <div className="stats" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12 }}>
            {[
              ['SpO₂', live.vitals.spo2, '%'],
              ['Temp.', live.vitals.temp, '°C'],
              ['Sleep', live.vitals.sleep, 'h'],
              ['Stress', live.vitals.stress, '/100'],
              ['Radiation', live.vitals.radiation, 'µSv/h'],
              ['Activity', live.activity === 'exercise' ? 'Exercise' : 'Rest', ''],
            ].map(([l, v, u]) => (
              <div key={l} className="stat" style={{ padding: '10px 12px' }}>
                <div className="stat-label">{l}</div>
                <div className="stat-value" style={{ fontSize: 17 }}>{v}<small>{u}</small></div>
              </div>
            ))}
          </div>
          {live.status.alerts.length > 0 && (
            <div className="stack" style={{ marginTop: 12 }}>
              {live.status.alerts.map((a) => (
                <div key={a.metric} className="row small"><LevelBadge level={a.level === 2 ? 'URGENT' : 'WATCH'} /> <span className="soft">{a.label}: {a.message}</span></div>
              ))}
            </div>
          )}
        </>
      ) : <Empty>Waiting for the live stream…</Empty>}
    </Panel>
  );
}
