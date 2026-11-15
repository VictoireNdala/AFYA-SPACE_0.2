import { C } from './core.jsx';

const ROW = 38;

/**
 * Animated ranked bars (Flourish "bar chart race" feel): rows re-sort with a smooth transition when
 * the mission day changes. One entity is highlighted; the rest stay quiet. Value printed at the bar tip.
 */
export default function RankedBars({ rows, highlight, unit = '', decimals = 1, thresholds = [], onSelect, signedValues = true }) {
  const values = rows.map((r) => r.value ?? 0);
  const min = Math.min(0, ...values);
  const max = Math.max(...values, ...thresholds.map((t) => t.value)) * 1.12 || 1;
  const pos = (v) => ((v - min) / (max - min)) * 100;
  const zero = pos(0);
  const order = [...rows].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity)).map((r) => r.id);
  const fmt = (v) => (v == null ? '–' : `${signedValues && v > 0 ? '+' : ''}${Number(v).toFixed(decimals)}${unit ? ` ${unit}` : ''}`);

  return (
    <div className="race" style={{ height: rows.length * ROW + 24, paddingTop: 24 }} role="list">
      <div style={{ position: 'absolute', left: 104, right: 70, top: 24, bottom: 0 }}>
        <div className="race-zero" style={{ left: `${zero}%` }} />
        {thresholds.map((t) => (
          <div key={t.level} className="race-thr" style={{ left: `${pos(t.value)}%`, borderColor: t.level === 'URGENT' ? C.critical : C.warning }}>
            <span>{t.level === 'URGENT' ? 'Urgent' : 'Watch'} {t.value}</span>
          </div>
        ))}
      </div>
      {rows.map((r) => {
        const rank = order.indexOf(r.id);
        const v = r.value ?? 0;
        const on = r.id === highlight;
        const left = Math.min(zero, pos(v));
        const width = Math.abs(pos(v) - zero);
        return (
          <div
            key={r.id}
            role="listitem"
            className="race-row"
            style={{ transform: `translateY(${rank * ROW + 24}px)`, top: 0, height: ROW, gridTemplateColumns: '92px 1fr' }}
            onClick={() => onSelect?.(r.id)}
            title={`${r.label}: ${fmt(r.value)}`}
          >
            <div className="race-label">
              <b style={{ color: on ? C.text : C.text2 }}>{r.label}</b>
              <span>{r.sub}</span>
            </div>
            <div className="race-track" style={{ marginRight: 70 }}>
              <div className={`race-bar ${v < 0 ? 'neg' : ''}`} style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, background: on ? C.series1 : C.contextBar }} />
              <div className="race-value" style={{ left: `calc(${Math.max(pos(v), zero)}% + 8px)`, color: on ? C.text : C.text2 }}>{fmt(r.value)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
