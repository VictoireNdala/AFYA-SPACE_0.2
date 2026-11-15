import { useState } from 'react';
import Icon from '../components/Icon.jsx';

// Chart tokens (dark theme, validated with the dataviz palette checker against #121418).
export const C = {
  series1: '#3a9fd6',
  series2: '#d9682f',
  series3: '#2aa37a',
  context: '#3a3d43',
  contextHover: '#6d7078',
  contextBar: '#3b4048',
  zero: '#24272c',
  grid: '#1d2024',
  axis: '#34373d',
  baseline: '#5d5f64',
  text: '#eeece6',
  text2: '#aaa79f',
  muted: '#77746d',
  surface: '#121418',
  warning: '#d9a441',
  critical: '#d64c3f',
  serious: '#d9682f',
  good: '#3fae74',
  accent: '#eeece6',
  // Sequential blue ramp (dark mode), for ordered magnitudes.
  seq: ['#2a5f94', '#3a7fbf', '#4a9fd8', '#9cc2e6'],
};

export const axisTick = { fill: C.muted, fontSize: 11 };

/**
 * Flourish-style chart frame: title, subtitle, legend, the chart, a source footer,
 * and a Chart/Table toggle so every value is reachable without hovering.
 */
export function ChartFrame({ title, subtitle, legend, actions, table, footer, children }) {
  const [view, setView] = useState('chart');
  return (
    <figure className="chart-frame" style={{ margin: 0 }}>
      <div className="chart-head">
        <div>
          {title && <figcaption className="chart-title">{title}</figcaption>}
          {subtitle && <p className="chart-sub">{subtitle}</p>}
        </div>
        <div className="row">
          {actions}
          {table && (
            <div className="seg" role="group" aria-label="View">
              <button aria-pressed={view === 'chart'} onClick={() => setView('chart')} title="Chart view"><Icon name="chart" size={14} /></button>
              <button aria-pressed={view === 'table'} onClick={() => setView('table')} title="Table view"><Icon name="table" size={14} /></button>
            </div>
          )}
        </div>
      </div>
      {legend && view === 'chart' && <div className="legend">{legend}</div>}
      {view === 'chart' || !table ? children : <DataTable {...table} />}
      {footer && <div className="chart-foot">{footer}</div>}
    </figure>
  );
}

export function DataTable({ columns, rows, max = 400 }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
      <table className="table">
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.num ? 'num' : ''}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, max).map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key} className={c.num ? 'num' : ''}>{c.format ? c.format(r[c.key], r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TooltipCard({ title, rows }) {
  return (
    <div className="tooltip">
      <div className="tooltip-title">{title}</div>
      <div className="stack" style={{ gap: 4 }}>
        {rows.map((r) => (
          <div key={r.label} className="tooltip-row">
            <span className="k">{r.color && <span className="key-line" style={{ background: r.color, width: 10 }} />}{r.label}</span>
            <b>{r.value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export const LegendLine = ({ color, label, dashed }) => (
  <span>{dashed ? <i className="key-dash" style={{ borderColor: color }} /> : <i className="key-line" style={{ background: color }} />}{label}</span>
);
export const LegendBox = ({ color, label, ring }) => (
  <span><i className="key-box" style={{ background: ring ? 'transparent' : color, boxShadow: ring ? `inset 0 0 0 1px ${color}` : 'none' }} />{label}</span>
);
