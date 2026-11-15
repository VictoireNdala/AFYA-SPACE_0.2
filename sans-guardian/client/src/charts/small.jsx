import { useMemo, useState } from 'react';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { C, axisTick, TooltipCard } from './core.jsx';
import { dayLabel, signed } from '../lib/format.js';

/** Tiny trend line for crew cards: delta vs baseline with the watch threshold and an end dot. */
export function Sparkline({ points, watch, height = 38, color = C.series1 }) {
  const w = 220;
  const h = height;
  if (!points?.length) return <svg width="100%" height={h} />;
  const xs = points.map((p) => p.day);
  const ys = points.map((p) => p.delta ?? 0);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs, x0 + 1);
  const y0 = Math.min(0, ...ys);
  const y1 = Math.max(...ys, watch ?? 0, 1);
  const sx = (x) => 4 + ((x - x0) / (x1 - x0)) * (w - 12);
  const sy = (y) => h - 4 - ((y - y0) / (y1 - y0)) * (h - 8);
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${sx(p.day).toFixed(1)},${sy(p.delta ?? 0).toFixed(1)}`).join(' ');
  const last = points.at(-1);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" aria-hidden="true">
      <line x1={0} x2={w} y1={sy(0)} y2={sy(0)} stroke={C.axis} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      {watch != null && <line x1={0} x2={w} y1={sy(watch)} y2={sy(watch)} stroke={C.warning} strokeOpacity={0.6} strokeDasharray="3 3" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
      <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={sx(last.day)} cy={sy(last.delta ?? 0)} r={3.5} fill={color} stroke={C.surface} strokeWidth={2} />
    </svg>
  );
}

/** Meter: fill on a lighter track of the same hue. */
export function Meter({ label, value, max = 100, display, color = C.series1, sub }) {
  const pctW = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="meter">
      <div className="meter-head"><span className="soft">{label}</span><b>{display ?? value}</b></div>
      <div className="meter-track"><div className="meter-fill" style={{ width: `${pctW}%`, background: color }} /></div>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

/** Explainable risk: each factor's contribution against its maximum weight. */
export function ContributionBars({ factors }) {
  return (
    <div className="stack" style={{ gap: 14 }}>
      {factors.map((f) => (
        <div key={f.id} className="meter">
          <div className="meter-head">
            <span>{f.label}</span>
            <b className="num">{f.contribution > 0 ? '+' : ''}{f.contribution.toFixed(1)} <span className="muted" style={{ fontWeight: 400 }}>/ {f.max}</span></b>
          </div>
          <div className="meter-track"><div className="meter-fill" style={{ width: `${(f.contribution / f.max) * 100}%` }} /></div>
          <span className="small muted">{f.detail}</span>
        </div>
      ))}
    </div>
  );
}

/** Tall segmented bar: one whole split into parts, value printed inside when it fits. */
export function SegmentedBar({ parts, emptyLabel = 'Empty' }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  if (!total) return <div className="segbar"><div className="empty">{emptyLabel}</div></div>;
  return (
    <div className="segbar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
      {parts.filter((p) => p.value > 0).map((p) => (
        <div key={p.label} style={{ flexGrow: p.value, background: p.color, color: p.ink ?? '#fff' }} title={`${p.label}: ${p.value}`}>
          {p.value / total > 0.12 ? p.value : ''}
        </div>
      ))}
    </div>
  );
}

/** Supplement calendar heatmap (weeks x weekdays), with launch / landing / today markers. */
export function AdherenceHeatmap({ calendar, today, landing = 180 }) {
  const [hover, setHover] = useState(null);
  const first = calendar[0]?.day ?? 0;
  const col = (day) => Math.floor((day - first) / 7);
  const markers = [
    { day: 0, label: 'Launch' },
    { day: landing, label: 'Landing' },
  ].filter((m) => m.day >= first && m.day <= (calendar.at(-1)?.day ?? 0));
  return (
    <div>
      <div className="heat-scroll">
        {markers.map((m) => (
          <span key={m.label} className="heat-marker" style={{ left: 2 + col(m.day) * 13 }}>{m.label}</span>
        ))}
        <div className="heat" onMouseLeave={() => setHover(null)}>
          {calendar.map((c) => (
            <span
              key={c.day}
              className={`heat-cell ${c.status} ${c.day === today ? 'today' : ''}`}
              onMouseEnter={() => setHover(c)}
              title={`${dayLabel(c.day)} · ${c.status === 'taken' ? `Taken ${c.time ?? ''}` : c.status === 'missed' ? 'Not logged' : 'Scheduled'}`}
            />
          ))}
        </div>
      </div>
      <div className="row between small" style={{ marginTop: 6, minHeight: 20 }}>
        <div className="legend">
          <span><i className="key-box" style={{ background: C.series1 }} />Taken</span>
          <span><i className="key-box" style={{ background: C.serious }} />Not logged</span>
          <span><i className="key-box" style={{ boxShadow: 'inset 0 0 0 1px #d8d5ce' }} />Scheduled</span>
        </div>
        <span className="soft">{hover ? `${dayLabel(hover.day)} · ${hover.status === 'taken' ? `taken at ${hover.time ?? '–'}` : hover.status === 'missed' ? 'not logged' : 'scheduled'}` : 'Hover a day for details'}</span>
      </div>
    </div>
  );
}

/** Daily self-reported blurry vision (0-3), aligned with the trend chart above it. */
export function SymptomStrip({ symptoms, domainX = [-90, 360], today, height = 74 }) {
  const data = useMemo(() => symptoms.map((s) => ({ day: s.day, v: s.blurry, venous: s.venous })), [symptoms]);
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 6, right: 86, bottom: 0, left: 0 }} barCategoryGap={0}>
          <XAxis type="number" dataKey="day" domain={domainX} hide allowDataOverflow />
          <YAxis domain={[0, 3]} ticks={[0, 3]} width={48} tick={axisTick} axisLine={false} tickLine={false} />
          <Bar dataKey="v" isAnimationActive={false} barSize={2} minPointSize={1}>
            {data.map((d) => <Cell key={d.day} fill={d.v === 0 ? C.zero : C.seq[Math.min(3, d.v)]} />)}
          </Bar>
          <Tooltip
            cursor={{ fill: 'rgba(45,106,168,0.06)' }}
            isAnimationActive={false}
            content={({ active, payload }) => (active && payload?.length ? <TooltipCard title={dayLabel(payload[0].payload.day)} rows={[{ label: 'Blurry vision (0-3)', value: payload[0].payload.v }]} /> : null)}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export const deltaText = (v, unit, d = 1) => `${signed(v, d)} ${unit}`;
