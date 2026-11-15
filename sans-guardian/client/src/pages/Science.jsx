import { useMemo, useState } from 'react';
import { useApi, useApp } from '../lib/live.jsx';
import Icon, { LevelBadge } from '../components/Icon.jsx';
import { Panel, Empty, Stat } from '../components/chrome.jsx';
import { ChartFrame, LegendBox, C } from '../charts/core.jsx';
import { fixed } from '../lib/format.js';
import { niceTicks } from '../charts/TrendChart.jsx';

const pctTxt = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`);
const RISK_CLASS = { Low: 'low', Moderate: 'moderate', High: 'high' };

export default function Science() {
  const { data: model, error: modelErr } = useApi('/model');
  const { data: tas } = useApi('/nasa/tas');
  const { data: glds } = useApi('/nasa/glds700');
  return (
    <div className="grid" style={{ gap: 20 }}>
      <Panel className="flat">
        <div className="row wrap" style={{ gap: 28 }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div className="eyebrow">What this page shows</div>
            <p className="soft" style={{ marginTop: 6 }}>
              Two kinds of evidence, kept apart on purpose. <b style={{ color: 'var(--text)' }}>Real NASA open data</b> from the Open Science Data Repository on the ex vivo human eye model of SANS, and a <b style={{ color: 'var(--text)' }}>prediction model</b> trained on simulated missions. The NASA datasets are not used to train the model.
            </p>
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            {['GLDS-700', 'OSD-817', 'OSD-815', 'LSDS-135', 'LSDS-132'].map((s) => <span key={s} className="badge info"><Icon name="database" size={12} /> NASA OSDR {s}</span>)}
          </div>
        </div>
      </Panel>
      {modelErr && <Panel><Empty>Model results not found. Run the analysis module (see README).</Empty></Panel>}
      {model && <ModelSection model={model} />}
      {tas && <TasSection tas={tas} />}
      {glds && <GldsSection glds={glds} />}
    </div>
  );
}

/* ------------------------------------------------------------------ prediction model */
function ModelSection({ model }) {
  const { selected, setSelected } = useApp();
  const best = model.metrics[0];
  const crew = [...model.crew].sort((a, b) => b.risk_probability - a.risk_probability);
  const contrib = model.contributions[selected] ?? [];
  return (
    <>
      <div className="stats">
        <Stat label="Best model (5-fold cross-validation)" value={model.info.best_model} sub={`ROC-AUC ${fixed(best.roc_auc, 3)} on simulated missions`} />
        <Stat label="Training missions" value={model.info.n_train} sub={`${model.info.n_train_positive} with significant change (${Math.round(model.info.prevalence * 100)}%)`} />
        <Stat label="Crew scored" value={model.crew.length} sub={`Data up to flight day ${model.scored_up_to_day}, features from the first ${model.early_window_days} days`} />
        <Stat label="Anomalous measurements" value={model.anomalies.length} sub="Isolation Forest on measurement residuals" />
      </div>

      <div className="grid g-12">
        <Panel className="span-7">
          <ChartFrame
            title="Predicted risk of significant SANS-like change"
            subtitle={`Probability by end of mission. ${model.outcome_definition}.`}
            footer={<span>Trained on simulated historical missions. A high AUC reflects the simulation's own assumptions, not real-world accuracy.</span>}
            table={{ columns: [{ key: 'astronaut_id', label: 'Astronaut' }, { key: 'risk_probability', label: 'Probability', num: true, format: pctTxt }, { key: 'risk_level', label: 'Level' }, { key: 'wellbeing_index', label: 'Wellbeing', num: true }, { key: 'anomalous_days', label: 'Anomalies', num: true }, { key: 'top_factors', label: 'Main factors' }], rows: crew }}
          >
            <div className="stack" style={{ gap: 4 }}>
              {crew.map((c) => {
                const on = c.astronaut_id === selected;
                return (
                  <button key={c.astronaut_id} className="list-item" onClick={() => setSelected(c.astronaut_id)} style={{ background: 'transparent', border: 0, borderBottom: '1px solid var(--hair)', width: '100%', textAlign: 'left', color: 'inherit', alignItems: 'flex-start' }}>
                    <div style={{ width: 82 }}>
                      <div className="title" style={{ color: on ? 'var(--text)' : 'var(--text-2)' }}>{c.astronaut_id}</div>
                      <span className={`badge ${RISK_CLASS[c.risk_level]}`} style={{ marginTop: 4 }}>{c.risk_level}</span>
                    </div>
                    <div className="grow">
                      <div className="row" style={{ gap: 10 }}>
                        <div className="meter-track" style={{ flex: 1, height: 8 }}><div className="meter-fill" style={{ width: `${c.risk_probability * 100}%`, background: on ? C.series1 : C.contextBar }} /></div>
                        <b className="num" style={{ width: 44, textAlign: 'right' }}>{pctTxt(c.risk_probability)}</b>
                      </div>
                      <div className="sub" style={{ marginTop: 4 }}>{c.top_factors || 'No dominant factor'}</div>
                      <div className="sub">Wellbeing index {c.wellbeing_index} / 100 · {c.anomalous_days} anomalous measurement{c.anomalous_days === 1 ? '' : 's'}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ChartFrame>
        </Panel>

        <Panel className="span-5">
          <ChartFrame
            title={`Why ${selected}?`}
            subtitle="Contribution of each factor (standardised value × logistic coefficient). Positive raises the estimated risk."
            legend={<><LegendBox color={C.series2} label="Raises risk" /><LegendBox color={C.series1} label="Lowers risk" /></>}
            table={{ columns: [{ key: 'label', label: 'Factor' }, { key: 'value', label: 'Contribution', num: true, format: (v) => fixed(v, 2) }], rows: contrib }}
          >
            <Diverging rows={contrib.slice(0, 10).map((c) => ({ label: c.label, value: c.value }))} />
          </ChartFrame>
        </Panel>
      </div>

      <div className="grid g-12">
        <Panel className="span-5">
          <ChartFrame title="Model comparison" subtitle="Out-of-fold ROC-AUC, 5-fold stratified cross-validation." table={{ columns: [{ key: 'model', label: 'Model' }, { key: 'roc_auc', label: 'ROC-AUC', num: true, format: (v) => fixed(v, 3) }, { key: 'accuracy', label: 'Accuracy', num: true, format: (v) => fixed(v, 3) }, { key: 'recall', label: 'Recall', num: true, format: (v) => fixed(v, 3) }, { key: 'f1', label: 'F1', num: true, format: (v) => fixed(v, 3) }, { key: 'brier', label: 'Brier', num: true, format: (v) => fixed(v, 3) }], rows: model.metrics }}>
            <div className="stack" style={{ gap: 12 }}>
              {model.metrics.map((m, i) => (
                <div key={m.model} className="meter">
                  <div className="meter-head"><span>{m.model}</span><b className="num">{fixed(m.roc_auc, 3)}</b></div>
                  <div className="meter-track"><div className="meter-fill" style={{ width: `${((m.roc_auc - 0.5) / 0.5) * 100}%`, background: i === 0 ? C.series1 : C.contextBar }} /></div>
                </div>
              ))}
              <span className="small muted">Bars start at 0.5 (chance level).</span>
            </div>
          </ChartFrame>
        </Panel>
        <Panel className="span-7">
          <ChartFrame title="What drives the model overall" subtitle="Logistic regression coefficients on standardised features (explainable reference model)." legend={<><LegendBox color={C.series2} label="Raises risk" /><LegendBox color={C.series1} label="Lowers risk" /></>}>
            <Diverging rows={model.importance.slice(0, 12).map((f) => ({ label: f.label, value: f.coef }))} />
          </ChartFrame>
        </Panel>
      </div>

      {model.alerts.length > 0 && (
        <Panel title="Model-side alerts" subtitle="Rules from the analysis module (demo thresholds), for comparison with the onboard alerts.">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Level</th><th>Astronaut</th><th>Rule</th><th>Message</th><th className="num">Value</th><th className="num">Threshold</th></tr></thead>
              <tbody>
                {model.alerts.map((a, i) => (
                  <tr key={i}><td><LevelBadge level={a.level} /></td><td><b>{a.astronaut_id}</b></td><td className="small">{a.rule.replace(/_/g, ' ')}</td><td className="small soft">{a.message}</td><td className="num">{a.value}</td><td className="num soft">{a.threshold}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}

/** Diverging horizontal bars around zero: two hues, neutral axis, value at the tip. */
function Diverging({ rows }) {
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 0.01);
  return (
    <div className="stack" style={{ gap: 7 }}>
      {rows.map((r) => {
        const w = (Math.abs(r.value) / max) * 50;
        const pos = r.value >= 0;
        return (
          <div key={r.label} style={{ display: 'grid', gridTemplateColumns: '170px 1fr', alignItems: 'center', gap: 10 }} title={`${r.label}: ${fixed(r.value, 2)}`}>
            <span className="small soft truncate">{r.label}</span>
            <div style={{ position: 'relative', height: 16 }}>
              <div style={{ position: 'absolute', left: '50%', top: -2, bottom: -2, width: 1, background: C.axis }} />
              <div style={{ position: 'absolute', top: 3, height: 10, left: pos ? '50%' : `${50 - w}%`, width: `${w}%`, background: pos ? C.series2 : C.series1, borderRadius: pos ? '0 3px 3px 0' : '3px 0 0 3px', transition: 'all .6s' }} />
              <span className="num" style={{ position: 'absolute', top: -1, fontSize: 11.5, color: C.text2, left: pos ? `calc(${50 + w}% + 6px)` : undefined, right: pos ? undefined : `calc(${50 + w}% + 6px)` }}>{fixed(r.value, 2)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ NASA OSDR: TAS */
const TAS_MAIN = ['ctb_counts', 'tunel_counts', 'ihc_GFAP', 'ihc_TLR4', 'fn_iop', 'coliv_iop'];

function TasSection({ tas }) {
  const [measure, setMeasure] = useState('ctb_counts');
  const s = tas.summaries[measure];
  const test = tas.tests.find((t) => t.measure === measure);
  const anySig = tas.tests.some((t) => t.significant_p05);
  return (
    <>
      <Panel>
        <ChartFrame
          title="NASA OSDR: the ex vivo human eye model of SANS"
          subtitle={`Translaminar autonomous system: 18 donor eyes (9 donors) held for 7 days at different intracranial (ICP) and intraocular (IOP) pressures and optic nerve tilts. ${tas.reference}.`}
          actions={
            <select className="input" style={{ width: 260 }} value={measure} onChange={(e) => setMeasure(e.target.value)} aria-label="Measure">
              {TAS_MAIN.concat(Object.keys(tas.measures).filter((m) => !TAS_MAIN.includes(m))).map((m) => <option key={m} value={m}>{tas.measures[m]}</option>)}
            </select>
          }
          legend={<><LegendBox color={C.series1} label="Group mean ± SEM" /><span><i style={{ width: 8, height: 8, borderRadius: 4, background: C.text2, display: 'inline-block' }} />Individual eye</span></>}
          footer={<><span>Source: NASA OSDR OSD-817 (design), LSDS-135 (IHC, CTB, TUNEL), LSDS-132 (Western blot)</span><span>{test ? `Kruskal-Wallis H = ${test.kruskal_H}, p = ${test.p_value}` : ''}</span></>}
          table={{ columns: [{ key: 'eye_id', label: 'Eye' }, { key: 'donor', label: 'Donor' }, { key: 'group', label: 'Group', num: true }, { key: measure, label: s.label, num: true, format: (v) => fixed(v, 2) }], rows: tas.eyes }}
        >
          <GroupDots groups={tas.groups} summary={s.groups} eyes={tas.eyes} measure={measure} />
        </ChartFrame>
      </Panel>
      <div className="grid g-12">
        <Panel className="span-7" title="Group tests" subtitle="Kruskal-Wallis across the 6 pressure groups, 3 eyes per group: very low statistical power, results are descriptive.">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Measure</th><th className="num">H</th><th className="num">p</th><th>p &lt; 0.05</th></tr></thead>
              <tbody>{tas.tests.map((t) => <tr key={t.measure}><td className="small">{t.label}</td><td className="num">{t.kruskal_H}</td><td className="num">{t.p_value}</td><td>{t.significant_p05 ? <span className="badge watch">Yes</span> : <span className="muted small">No</span>}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
        <Panel className="span-5" title="Reading these data honestly">
          <div className="stack small soft" style={{ gap: 12 }}>
            <p><Icon name="info" size={12} /> {anySig ? 'Some measures differ between groups, but with 3 eyes per group the result is fragile.' : 'No measure differs significantly between the six groups (p < 0.05).'}</p>
            <p><Icon name="alert" size={12} /> The CTB and TUNEL group means match the paper's figures only when paper group k is compared with OSDR group k−1 (correlation {tas.paper_label_check.map((r) => `${r.assay.split('_')[0].toUpperCase()} ${r['r_paper_Gk_vs_OSDR_G(k-1)']}`).join(', ')}). This suggests a group-labelling difference to clarify with the data owners.</p>
            {tas.consistency_issues.length > 0 && <p><Icon name="alert" size={12} /> {tas.consistency_issues.join(' ')}</p>}
            <p><Icon name="database" size={12} /> OSD-815 (globe photography, {tas.osd815_samples} samples): design metadata only; the measurements are in an archive not provided.</p>
            <p>Donor tissue, not astronaut data. These datasets ground the project in NASA science; they are not used to train the crew model.</p>
          </div>
        </Panel>
      </div>
    </>
  );
}

/** Dot plot: one column per pressure group, individual eyes as dots, mean ± SEM as a bar. */
function GroupDots({ groups, summary, eyes, measure }) {
  const W = 900;
  const H = 260;
  const P = { l: 48, r: 12, t: 14, b: 58 };
  const vals = eyes.map((e) => e[measure]).filter((v) => v != null);
  const nt = niceTicks(0, Math.max(...vals, ...summary.map((g) => (g.mean ?? 0) + (g.sem ?? 0))) * 1.05 || 1, 4);
  const hi = nt.ticks.at(-1);
  const keys = Object.keys(groups).map(Number).sort();
  const bw = (W - P.l - P.r) / keys.length;
  const sy = (v) => P.t + (1 - v / hi) * (H - P.t - P.b);
  const ticks = nt.ticks;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Values by pressure group">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={P.l} x2={W - P.r} y1={sy(t)} y2={sy(t)} stroke={C.grid} />
          <text x={P.l - 8} y={sy(t) + 4} fontSize="11" fill={C.muted} textAnchor="end">{t}</text>
        </g>
      ))}
      {keys.map((k, i) => {
        const g = summary.find((x) => x.group === k);
        const cx = P.l + bw * i + bw / 2;
        const pts = eyes.filter((e) => e.group === k && e[measure] != null);
        return (
          <g key={k}>
            {g?.mean != null && (
              <>
                <rect x={cx - 18} y={sy(g.mean)} width={36} height={Math.max(0, sy(0) - sy(g.mean))} fill={C.series1} opacity="0.85" rx="3" />
                <line x1={cx} x2={cx} y1={sy(g.mean + (g.sem ?? 0))} y2={sy(Math.max(0, g.mean - (g.sem ?? 0)))} stroke={C.text} strokeWidth="1.5" />
                <line x1={cx - 6} x2={cx + 6} y1={sy(g.mean + (g.sem ?? 0))} y2={sy(g.mean + (g.sem ?? 0))} stroke={C.text} strokeWidth="1.5" />
              </>
            )}
            {pts.map((e, j) => (
              <circle key={e.eye_id} cx={cx + 26 + (j - 1) * 9} cy={sy(e[measure])} r="4" fill={C.text2} stroke={C.surface} strokeWidth="1.5">
                <title>{`${e.eye_id}: ${e[measure]}`}</title>
              </circle>
            ))}
            <text x={cx} y={H - P.b + 18} fontSize="11.5" fill={C.text} textAnchor="middle" fontWeight="600">G{k}</text>
            <text x={cx} y={H - P.b + 33} fontSize="10.5" fill={C.text2} textAnchor="middle">ICP:IOP {groups[k].icp}:{groups[k].iop}</text>
            <text x={cx} y={H - P.b + 47} fontSize="10.5" fill={C.muted} textAnchor="middle">{groups[k].tilt ? `${groups[k].tilt}° tilt` : k === 3 ? 'IOP 21 then 16' : k === 1 ? 'Earth average' : 'no tilt'}</text>
          </g>
        );
      })}
      <line x1={P.l} x2={W - P.r} y1={sy(0)} y2={sy(0)} stroke={C.axis} />
    </svg>
  );
}

/* ------------------------------------------------------------------ NASA OSDR: GLDS-700 */
function GldsSection({ glds }) {
  const [kit, setKit] = useState('VILO');
  const rows = useMemo(() => glds.expression.filter((e) => e.kit === kit && e.category !== 'Reference'), [glds, kit]);
  const logs = rows.map((r) => Math.log10(r.rel_expression));
  const lo = Math.floor(Math.min(...logs));
  const hi = Math.ceil(Math.max(...logs, 0));
  const pos = (v) => ((Math.log10(v) - lo) / (hi - lo)) * 100;
  const cats = [...new Set(rows.map((r) => r.category))];
  return (
    <Panel>
      <ChartFrame
        title="NASA OSDR GLDS-700: retina gene-expression reference"
        subtitle={`RT-PCR on human donor retina (${glds.sample}). Relative expression vs GAPDH (2^−ΔCq), log scale. A reference profile and a quality check, not a comparison of conditions.`}
        actions={<div className="seg" role="group" aria-label="RT kit">{['VILO', 'iSCRIPT'].map((k) => <button key={k} aria-pressed={kit === k} onClick={() => setKit(k)}>{k === 'VILO' ? 'VILO kit' : 'iScript kit'}</button>)}</div>}
        legend={<><LegendBox color={C.series1} label="Good amplification" /><LegendBox color={C.series2} label={`Low template (Cq > ${glds.low_confidence_cq}) or flagged`} /></>}
        footer={<><span>Source: NASA OSDR GLDS-700, plate 1</span><span>Kit agreement on ΔCq: r = {glds.concordance.pearson_r} over {glds.concordance.n_targets} targets, mean |ΔΔCq| = {glds.concordance.mean_abs_diff_dcq}</span></>}
        table={{ columns: [{ key: 'gene', label: 'Gene' }, { key: 'category', label: 'Category' }, { key: 'cq_mean', label: 'Mean Cq', num: true, format: (v) => fixed(v, 2) }, { key: 'delta_cq', label: 'ΔCq', num: true, format: (v) => fixed(v, 2) }, { key: 'rel_expression', label: 'Relative expression', num: true, format: (v) => (v < 0.01 ? v.toExponential(1) : fixed(v, 3)) }, { key: 'flag', label: 'QC' }], rows }}
      >
        <div className="stack" style={{ gap: 14 }}>
          {cats.map((cat) => (
            <div key={cat}>
              <div className="eyebrow" style={{ marginBottom: 6 }}>{cat}</div>
              <div className="stack" style={{ gap: 4 }}>
                {rows.filter((r) => r.category === cat).map((r) => (
                  <div key={r.Target} style={{ display: 'grid', gridTemplateColumns: '80px 1fr 70px', gap: 10, alignItems: 'center' }} title={`${r.gene}: ΔCq ${fixed(r.delta_cq, 2)}, ${r.flag}`}>
                    <span className="small" style={{ fontWeight: 600 }}>{r.gene}</span>
                    <div style={{ position: 'relative', height: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 2 }}>
                      <div style={{ position: 'absolute', left: 0, top: 2, height: 8, width: `${Math.max(0.5, pos(r.rel_expression))}%`, background: r.flag === 'OK' ? C.series1 : C.series2, borderRadius: '0 3px 3px 0', transition: 'width .6s' }} />
                    </div>
                    <span className="small num soft" style={{ textAlign: 'right' }}>{r.rel_expression < 0.01 ? r.rel_expression.toExponential(1) : fixed(r.rel_expression, 3)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="row between small muted"><span>10^{lo}</span><span>Relative to GAPDH (log scale)</span><span>10^{hi}</span></div>
        </div>
      </ChartFrame>
    </Panel>
  );
}
