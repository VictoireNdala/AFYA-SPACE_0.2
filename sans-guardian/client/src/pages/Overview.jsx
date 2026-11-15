import { useRef, useState } from 'react';
import { useApi, useApp, useLive } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import Icon, { LevelBadge, RiskBadge } from '../components/Icon.jsx';
import { Panel, Stat, Empty } from '../components/chrome.jsx';
import { ChartFrame, LegendLine } from '../charts/core.jsx';
import RankedBars from '../charts/RankedBars.jsx';
import { Sparkline } from '../charts/small.jsx';
import { dayLabel, signed, pct } from '../lib/format.js';
import { C } from '../charts/core.jsx';

export default function Overview({ go }) {
  const { data } = useApi('/crew');
  const { data: alertData } = useApi('/alerts');
  const { vitals, link, state, selected, setSelected } = useLive();
  if (!data) return <Panel><Empty>Connecting to the onboard server…</Empty></Panel>;

  const crew = data.crew;
  const th = state?.protocol?.thresholds?.RETINA_DELTA_UM;
  const open = (alertData?.alerts ?? []).filter((a) => !a.acked);
  const live = (alertData?.live ?? []).filter((a) => !a.acked && !a.resolved);
  const urgent = open.filter((a) => a.level === 'URGENT').length + live.filter((a) => a.level === 'URGENT').length;
  const high = crew.filter((c) => c.risk.level === 'high').length;
  const top = [...crew].sort((a, b) => b.risk.score - a.risk.score)[0];
  const adh = crew.map((c) => c.adherence30).filter((v) => v != null);
  const meanAdh = adh.length ? Math.round(adh.reduce((t, v) => t + v, 0) / adh.length) : null;
  const openSel = (code) => {
    setSelected(code);
    go('astronaut');
  };

  return (
    <div className="grid" style={{ gap: 20 }}>
      <section className="cover">
        <div className="cover-text">
          <div className="eyebrow">{dayLabel(data.mission.day)} · {crew.length} crew · {data.mission.missionDays}-day mission</div>
          <div>
            <h2 className="cover-title">Seeing the change <em>before</em> the astronaut does.</h2>
            <p className="cover-lede" style={{ marginTop: 16 }}>About 70% of long-duration ISS crew show signs of SANS, often without noticing them. SANS Guardian follows measurements, countermeasures and symptoms on board, and sends the critical facts to the ground first.</p>
          </div>
          <div className="row wrap">
            <button className="btn primary" onClick={() => openSel(top.code)}>Review {top.code} <Icon name="chevron" size={13} /></button>
            <button className="btn" onClick={() => go('reports')}>Mission report</button>
          </div>
        </div>
        <CoverMedia />
        <div className="cover-figures" style={{ gridColumn: '1 / -1' }}>
          <Stat label="High follow-up priority" value={high} unit={`of ${crew.length}`} sub="Explainable score, demo weights" />
          <Stat label="Open urgent alerts" value={urgent} sub={`${open.length + live.length} open alerts in total`} />
          <Stat label="B-vitamin adherence" value={pct(meanAdh)} sub="Crew mean, last 30 days" />
          <Stat label="Waiting for downlink" value={link?.queued ?? '–'} unit="items" sub={link ? `${link.critical} critical · window ${link.open ? 'open' : 'closed'}` : 'Link status unknown'} />
        </div>
      </section>

      <div className="grid g-12">
        <Panel className="span-7">
          <ChartFrame
            title="Retinal thickness change, by astronaut"
            subtitle={`Latest OCT vs pre-flight baseline (µm) on ${dayLabel(data.mission.day)}. Rows re-rank as the mission clock moves.`}
            legend={<><LegendLine color={C.series1} label={selected} /><LegendLine color={C.contextBar} label="Rest of crew" /><LegendLine color={C.warning} label="Watch threshold" dashed /><LegendLine color={C.critical} label="Urgent threshold" dashed /></>}
            table={{ columns: [{ key: 'code', label: 'Astronaut' }, { key: 'role', label: 'Role' }, { key: 'delta', label: 'Change (µm)', num: true, format: (v) => signed(v, 1) }, { key: 'day', label: 'Measured', format: (v) => dayLabel(v) }], rows: crew.map((c) => ({ code: c.code, role: c.role, delta: c.retina.delta, day: c.retina.day })) }}
            footer={<><span>Source: simulated OCT data · thresholds are demo values</span><span>Click a row to open the astronaut</span></>}
          >
            <RankedBars
              rows={crew.map((c) => ({ id: c.code, label: c.code, sub: c.role, value: c.retina.delta }))}
              highlight={selected}
              unit="µm"
              thresholds={th ? [{ level: 'WATCH', value: th.watch }, { level: 'URGENT', value: th.urgent }] : []}
              onSelect={openSel}
            />
          </ChartFrame>
        </Panel>

        <Panel className="span-5" title="Open alerts" subtitle="Most recent first. Rule, value and threshold in every alert." actions={<button className="btn sm" onClick={() => go('alerts')}>View all <Icon name="chevron" size={13} /></button>}>
          {open.length + live.length === 0 && <Empty>No open alerts.</Empty>}
          <div className="list">
            {[...live, ...open].slice(0, 6).map((a) => (
              <div key={a.id} className="list-item">
                <LevelBadge level={a.level} />
                <div className="grow">
                  <div className="title truncate">{a.code} · {a.title}</div>
                  <div className="sub truncate">{a.source === 'live' ? 'Live vitals' : dayLabel(a.day)} · {a.message}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Crew" subtitle="Trend of retinal thickness change since launch, latest measurements and live heart rate. Click a card for details.">
        <div className="crew-grid">
          {crew.map((c) => {
            const v = vitals.find((x) => x.code === c.code);
            return (
              <button key={c.code} className="crew-card" onClick={() => openSel(c.code)} style={c.code === selected ? { borderColor: 'var(--text)' } : undefined}>
                <div className="row between">
                  <div>
                    <div className="code">{c.code}</div>
                    <div className="role">{c.role}</div>
                  </div>
                  <RiskBadge level={c.risk.level} score={c.risk.score} />
                </div>
                <Sparkline points={c.retina.points.filter((p) => p.day >= 0)} watch={th?.watch} color={c.code === selected ? C.series1 : '#6b7684'} />
                <div className="crew-metrics">
                  <div><b>{signed(c.retina.delta, 1)}</b><span>Retina µm</span></div>
                  <div><b>{signed(c.refraction.delta, 2)}</b><span>Refraction D</span></div>
                  <div><b>{pct(c.adherence30)}</b><span>Adherence</span></div>
                </div>
                <div className="row between small">
                  <span className="soft row" style={{ gap: 6 }}><Icon name="heart" size={13} /> {v ? `${v.vitals.hr} bpm` : '–'} <span className="muted">· {v?.activity === 'exercise' ? 'exercising' : 'at rest'}</span></span>
                  <span className="row" style={{ gap: 6 }}>
                    {c.alerts.URGENT > 0 && <span className="badge urgent"><Icon name="octagon" size={12} />{c.alerts.URGENT}</span>}
                    {c.alerts.WATCH > 0 && <span className="badge watch"><Icon name="alert" size={12} />{c.alerts.WATCH}</span>}
                    {c.activeSession && <span className="badge info"><Icon name="clock" size={12} />Session</span>}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Panel>

      <DemoControls />
    </div>
  );
}

function DemoControls() {
  const { state, selected } = useApp();
  const scenarios = Object.entries(state?.scenarios ?? {});
  const trigger = (name) => post(`/scenario/${name}?target=${selected}`).catch(() => {});
  return (
    <Panel className="flat" title="Demo controls" subtitle={`Inject a simulated live-vitals event for ${selected}, or reset the simulated mission.`}>
      <div className="row wrap">
        {scenarios.map(([k, label]) => (
          <button key={k} className="btn sm" onClick={() => trigger(k)}><Icon name="activity" size={13} /> {label}</button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn sm ghost" onClick={() => post('/demo/reset').catch(() => {})}><Icon name="refresh" size={13} /> Reset simulated mission</button>
      </div>
    </Panel>
  );
}

/** Cover: NASA video "How does NASA study vision and cognitive changes in space" (muted loop, sound on request). */
function CoverMedia() {
  const ref = useRef(null);
  const [muted, setMuted] = useState(true);
  const toggle = () => {
    const v = ref.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted) v.play().catch(() => {});
    setMuted(v.muted);
  };
  return (
    <div className="cover-media">
      <video ref={ref} src="/media/nasa-vision.mp4" poster="/images/nasa-eye-exam.jpg" autoPlay muted loop playsInline preload="metadata" />
      <button className="btn sm sound" onClick={toggle} aria-label={muted ? 'Turn sound on' : 'Mute'}>
        <Icon name="volume" size={13} /> {muted ? 'Sound on' : 'Mute'}
      </button>
      <span className="caption">NASA · How does NASA study vision and cognitive changes in space</span>
    </div>
  );
}