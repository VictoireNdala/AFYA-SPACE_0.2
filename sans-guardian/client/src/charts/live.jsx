import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, ReferenceLine, ReferenceArea, Tooltip, ResponsiveContainer } from 'recharts';
import { C, axisTick, TooltipCard } from './core.jsx';

/** Live vital sign over the last ~90 seconds, against the astronaut's personal baseline. */
export function LiveLine({ data, dataKey, baseline, unit, height = 150, label }) {
  const rows = data.map((d, i) => ({ i, v: d[dataKey] }));
  const last = rows.at(-1);
  const EndDot = ({ cx, cy, index }) =>
    index === rows.length - 1 && cx != null ? (
      <g key="end">
        <circle cx={cx} cy={cy} r={6} fill={C.surface} />
        <circle cx={cx} cy={cy} r={4} fill={C.series1} />
        <text x={cx + 9} y={cy + 4} fill={C.text} fontSize={12} fontWeight={600}>{last?.v} {unit}</text>
      </g>
    ) : (
      <g key={index} />
    );
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 10, right: 70, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="i" hide />
          <YAxis width={40} tick={axisTick} axisLine={false} tickLine={false} domain={['dataMin - 4', 'dataMax + 4']} tickFormatter={(v) => Math.round(v)} />
          {baseline != null && <ReferenceLine y={baseline} stroke={C.baseline} strokeDasharray="4 4" label={{ value: 'Personal baseline', position: 'insideBottomLeft', fill: C.muted, fontSize: 10.5 }} />}
          <Line dataKey="v" stroke={C.series1} strokeWidth={2} dot={EndDot} isAnimationActive={false} type="monotone" />
          <Tooltip isAnimationActive={false} cursor={{ stroke: C.accent, strokeOpacity: 0.3 }} content={({ active, payload }) => (active && payload?.length ? <TooltipCard title={`${rows.length - payload[0].payload.i - 1} s ago`} rows={[{ label, value: `${payload[0].value} ${unit}`, color: C.series1 }]} /> : null)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Contiguous radio-window segments for shading. */
function openSegments(history) {
  const segs = [];
  let start = null;
  history.forEach((h, i) => {
    if (h.open && start == null) start = i;
    if ((!h.open || i === history.length - 1) && start != null) {
      segs.push([start, h.open ? i : i - 1]);
      start = null;
    }
  });
  return segs;
}

/** Bytes transmitted per second; radio windows shaded. */
export function BytesChart({ history, height = 170 }) {
  const rows = history.map((h, i) => ({ i, bytes: h.bytes, queued: h.queued, open: h.open }));
  const segs = openSegments(history);
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <AreaChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="bytesWash" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={C.series1} stopOpacity={0.35} />
              <stop offset="100%" stopColor={C.series1} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={C.grid} />
          {segs.map(([a, b]) => <ReferenceArea key={a} x1={a} x2={b} fill={C.accent} fillOpacity={0.06} ifOverflow="hidden" />)}
          <XAxis dataKey="i" type="number" domain={[0, Math.max(rows.length - 1, 1)]} hide />
          <YAxis width={44} tick={axisTick} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}`} />
          <Area dataKey="bytes" type="stepAfter" stroke={C.series1} strokeWidth={1.75} fill="url(#bytesWash)" isAnimationActive={false} />
          <Tooltip isAnimationActive={false} cursor={{ stroke: C.accent, strokeOpacity: 0.3 }} content={({ active, payload }) => (active && payload?.length ? <TooltipCard title={`${rows.length - payload[0].payload.i - 1} s ago`} rows={[{ label: 'Bytes sent', value: payload[0].payload.bytes, color: C.series1 }, { label: 'Window', value: payload[0].payload.open ? 'Open' : 'Closed' }]} /> : null)} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Items waiting in the onboard queue over time (separate chart: never a second axis). */
export function QueueChart({ history, height = 120 }) {
  const rows = history.map((h, i) => ({ i, queued: h.queued }));
  const segs = openSegments(history);
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          {segs.map(([a, b]) => <ReferenceArea key={a} x1={a} x2={b} fill={C.accent} fillOpacity={0.06} ifOverflow="hidden" />)}
          <XAxis dataKey="i" type="number" domain={[0, Math.max(rows.length - 1, 1)]} hide />
          <YAxis width={44} tick={axisTick} axisLine={false} tickLine={false} allowDecimals={false} />
          <Line dataKey="queued" stroke={C.series3} strokeWidth={2} dot={false} isAnimationActive={false} type="stepAfter" />
          <Tooltip isAnimationActive={false} cursor={{ stroke: C.accent, strokeOpacity: 0.3 }} content={({ active, payload }) => (active && payload?.length ? <TooltipCard title={`${rows.length - payload[0].payload.i - 1} s ago`} rows={[{ label: 'Items queued', value: payload[0].payload.queued, color: C.series3 }]} /> : null)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Two-series projection with direct end labels + legend (used by the illustrative bone model). */
export function TwoLines({ data, a, b, xKey, xFormat, yDomain, marker, height = 220 }) {
  const lastIdx = data.length - 1;
  const End = (key, color, text) => ({ cx, cy, index }) =>
    index === lastIdx && cx != null ? (
      <g key={`${key}-end`}>
        <circle cx={cx} cy={cy} r={5.5} fill={C.surface} />
        <circle cx={cx} cy={cy} r={4} fill={color} />
        <text x={cx + 9} y={cy + 4} fill={C.text2} fontSize={11.5}>{text}</text>
      </g>
    ) : (
      <g key={`${key}-${index}`} />
    );
  return (
    <div style={{ width: '100%', height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 96, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey={xKey} type="number" domain={['dataMin', 'dataMax']} tickFormatter={xFormat} tick={axisTick} axisLine={{ stroke: C.axis }} tickLine={false} />
          <YAxis domain={yDomain} width={40} tick={axisTick} axisLine={false} tickLine={false} />
          {marker != null && <ReferenceLine x={marker} stroke={C.accent} strokeOpacity={0.6} label={{ value: 'Mission end', position: 'top', fill: C.accent, fontSize: 10.5 }} />}
          <Line dataKey={a.key} stroke={C.series1} strokeWidth={2} dot={End(a.key, C.series1, a.label)} isAnimationActive animationDuration={700} />
          <Line dataKey={b.key} stroke={C.series2} strokeWidth={2} dot={End(b.key, C.series2, b.label)} isAnimationActive animationDuration={700} />
          <Tooltip isAnimationActive={false} cursor={{ stroke: C.accent, strokeOpacity: 0.3 }} content={({ active, payload, label }) => (active && payload?.length ? <TooltipCard title={xFormat(label)} rows={[{ label: a.label, value: `${payload[0].payload[a.key].toFixed(1)}%`, color: C.series1 }, { label: b.label, value: `${payload[0].payload[b.key].toFixed(1)}%`, color: C.series2 }]} /> : null)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
