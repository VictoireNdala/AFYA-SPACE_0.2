import { useMemo } from 'react';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceArea, ReferenceDot, Tooltip, ResponsiveContainer } from 'recharts';
import { C, axisTick, TooltipCard } from './core.jsx';
import { dayLabel, signed, fixed } from '../lib/format.js';

const DEFAULT_TICKS = [-90, 0, 60, 120, 180, 270, 360];
const xLabel = (d) => (d === 0 ? 'Launch' : d === 180 ? 'Landing' : dayLabel(d));

/** Round, evenly spaced axis ticks (1, 2, 2.5, 5 x 10^n). */
export function niceTicks(lo, hi, count = 4) {
  const raw = (hi - lo) / count || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.999; v += step) out.push(Number(v.toFixed(6)));
  return { ticks: out, step };
}

/**
 * Highlight-one, grey-the-rest line chart (Flourish style): the selected astronaut in the accent,
 * the rest of the crew as quiet context, threshold bands, mission markers and an end label.
 */
export default function TrendChart({
  points,
  context = {},
  name,
  unit,
  decimals = 1,
  signedValues = true,
  thresholds = [],
  baseline = 0,
  showBaseline = true,
  today,
  domainX = [-90, 360],
  ticks = DEFAULT_TICKS,
  annotations = [],
  height = 250,
}) {
  const { rows, yDomain, yTicks, yStep } = useMemo(() => {
    const map = new Map();
    const put = (day, key, y) => {
      if (!map.has(day)) map.set(day, { day });
      map.get(day)[key] = y;
    };
    for (const p of points) put(p.day, 'sel', p.y);
    for (const [code, pts] of Object.entries(context)) for (const p of pts) put(p.day, code, p.y);
    const rowsOut = [...map.values()].sort((a, b) => a.day - b.day);
    const vals = [...points.map((p) => p.y), ...Object.values(context).flat().map((p) => p.y), ...thresholds.map((t) => t.value)];
    if (showBaseline) vals.push(baseline);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.08 || 1;
    const nt = niceTicks(lo - pad, hi + pad, 4);
    return { rows: rowsOut, yTicks: nt.ticks, yStep: nt.step, yDomain: [nt.ticks[0], nt.ticks.at(-1)] };
  }, [points, context, thresholds, baseline, showBaseline]);

  const last = points.at(-1);
  const fmt = (v) => (v == null ? '–' : signedValues ? `${signed(v, decimals)} ${unit}` : `${fixed(v, decimals)} ${unit}`);
  const sorted = [...thresholds].sort((a, b) => a.value - b.value);
  const watch = sorted.find((t) => t.level === 'WATCH');
  const urgent = sorted.find((t) => t.level === 'URGENT');
  const contextCodes = Object.keys(context);
  const gid = `wash-${String(name).replace(/[^a-zA-Z0-9]/g, '')}`;

  const EndDot = (props) => {
    const { cx, cy, index } = props;
    if (index !== rows.findLastIndex((r) => r.sel != null) || cx == null) return <g key={`e${index}`} />;
    return (
      <g key={`e${index}`}>
        <circle cx={cx} cy={cy} r={6} fill={C.surface} />
        <circle cx={cx} cy={cy} r={4.5} fill={C.series1} />
        <text x={cx + 10} y={cy + 4} fill={C.text} fontSize={12} fontWeight={600}>{fmt(last?.y)}</text>
      </g>
    );
  };

  const renderTip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const crewVals = contextCodes.map((c) => row[c]).filter((v) => v != null);
    const items = [{ label: name, value: fmt(row.sel), color: C.series1 }];
    if (crewVals.length) items.push({ label: 'Rest of crew', value: `${fixed(Math.min(...crewVals), decimals)} to ${fixed(Math.max(...crewVals), decimals)}`, color: C.contextHover });
    return <TooltipCard title={dayLabel(label)} rows={items} />;
  };

  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 22, right: 86, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.series1} stopOpacity={0.22} />
              <stop offset="100%" stopColor={C.series1} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          {today != null && today < domainX[1] && <ReferenceArea x1={today} x2={domainX[1]} fill="#ffffff" fillOpacity={0.025} ifOverflow="hidden" />}
          {watch && <ReferenceArea y1={watch.value} y2={urgent ? urgent.value : yDomain[1]} fill={C.warning} fillOpacity={0.035} ifOverflow="hidden" />}
          {urgent && <ReferenceArea y1={urgent.value} y2={yDomain[1]} fill={C.critical} fillOpacity={0.035} ifOverflow="hidden" />}
          <XAxis type="number" dataKey="day" domain={domainX} ticks={ticks.filter((t) => t >= domainX[0] && t <= domainX[1])} tickFormatter={xLabel} tick={axisTick} axisLine={{ stroke: C.axis }} tickLine={false} allowDataOverflow />
          <YAxis domain={yDomain} width={48} tick={axisTick} axisLine={false} tickLine={false} ticks={yTicks} interval={0} tickFormatter={(v) => (yStep < 1 ? Number(v).toFixed(yStep < 0.1 ? 2 : 1) : Number(v).toFixed(yStep % 1 ? 1 : 0))} />
          {showBaseline && <ReferenceLine y={baseline} stroke={C.baseline} label={{ value: 'Baseline', position: 'insideBottomLeft', fill: C.muted, fontSize: 10.5 }} />}
          {sorted.map((t) => (
            <ReferenceLine key={t.level} y={t.value} stroke={t.level === 'URGENT' ? C.critical : C.warning} strokeDasharray="4 4" strokeOpacity={0.9} label={{ value: `${t.level === 'URGENT' ? 'Urgent' : 'Watch'} ${t.value}`, position: 'right', fill: C.text2, fontSize: 10.5 }} />
          ))}
          <ReferenceLine x={0} stroke={C.axis} />
          <ReferenceLine x={180} stroke={C.axis} />
          {today != null && <ReferenceLine x={today} stroke={C.accent} strokeOpacity={0.55} label={{ value: 'Today', position: 'top', fill: C.accent, fontSize: 10.5 }} />}
          {contextCodes.map((c) => (
            <Line key={c} dataKey={c} stroke={C.context} strokeWidth={1.25} dot={false} activeDot={false} connectNulls isAnimationActive={false} />
          ))}
          <Area dataKey="sel" type="monotone" baseValue={showBaseline ? baseline : 'dataMin'} fill={`url(#${gid})`} stroke="none" connectNulls isAnimationActive animationDuration={1100} />
          <Line dataKey="sel" type="monotone" stroke={C.series1} strokeWidth={2.25} strokeLinecap="round" connectNulls dot={EndDot} activeDot={{ r: 5, fill: C.series1, stroke: C.surface, strokeWidth: 2 }} isAnimationActive animationDuration={1100} animationEasing="ease-out" />
          {annotations.map((a) => (
            <ReferenceDot key={`${a.day}-${a.label}`} x={a.day} y={a.y} r={5} fill={a.level === 'URGENT' ? C.critical : C.warning} stroke={C.surface} strokeWidth={2} label={{ value: a.label, position: 'left', fill: C.text, fontSize: 11, fontWeight: 600, offset: 10 }} />
          ))}
          <Tooltip content={renderTip} cursor={{ stroke: C.accent, strokeOpacity: 0.35 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
