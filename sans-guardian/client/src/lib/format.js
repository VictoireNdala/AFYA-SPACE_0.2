export const LANDING = 180;

export function dayLabel(day, landing = LANDING) {
  if (day == null) return '–';
  if (day < 0) return `L${day}`;
  if (day === landing) return 'Landing';
  if (day <= landing) return `FD ${day}`;
  return `R+${day - landing}`;
}

export function phaseLabel(day, landing = LANDING) {
  if (day < 0) return 'Pre-flight';
  if (day <= landing) return 'In flight';
  return 'Post-flight';
}

export const signed = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(d)}`);
export const fixed = (v, d = 1) => (v == null || Number.isNaN(v) ? '–' : Number(v).toFixed(d));
export const pct = (v) => (v == null ? '–' : `${v}%`);

export function clockTime(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export const bytes = (n) => (n == null ? '–' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);

export const LEVEL_CLASS = { URGENT: 'urgent', WATCH: 'watch', INFO: 'info' };
export const RISK_LABEL = { low: 'Low', moderate: 'Moderate', high: 'High' };
