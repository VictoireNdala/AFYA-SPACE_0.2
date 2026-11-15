import { useEffect, useRef, useState } from 'react';
import Icon, { LevelBadge } from './Icon.jsx';
import { useApp, useStream } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import { dayLabel, phaseLabel } from '../lib/format.js';

/** Mission clock: scrub or play the 180-day mission (+ pre/post-flight). Every view follows it. */
export function MissionClock() {
  const { state } = useApp();
  const m = state?.mission;
  const [local, setLocal] = useState(null);
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const day = local ?? m?.day ?? 0;

  useEffect(() => {
    if (local != null && m && local === m.day) setLocal(null);
  }, [m, local]);

  const commit = (d) => post('/mission/day', { day: d }).catch(() => {});

  useEffect(() => {
    if (!playing || !m) return undefined;
    let d = m.day;
    timer.current = setInterval(() => {
      d = Math.min(m.lastDay, d + 3);
      setLocal(d);
      commit(d);
      if (d >= m.lastDay) setPlaying(false);
    }, 450);
    return () => clearInterval(timer.current);
  }, [playing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!m) return null;
  const span = m.lastDay - m.firstDay;
  const at = (d) => `${((d - m.firstDay) / span) * 100}%`;

  return (
    <div className="clock" aria-label="Mission clock">
      <button className="btn icon ghost" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause mission playback' : 'Play mission'} title={playing ? 'Pause' : 'Play the mission'}>
        <Icon name={playing ? 'pause' : 'play'} size={15} />
      </button>
      <div className="clock-day">
        <span>{phaseLabel(day, m.landingDay)}</span>
        <b>{dayLabel(day, m.landingDay)}</b>
      </div>
      <div className="clock-track">
        <input
          type="range"
          min={m.firstDay}
          max={m.lastDay}
          value={day}
          style={{ '--fill': at(day) }}
          onChange={(e) => setLocal(Number(e.target.value))}
          onPointerUp={(e) => commit(Number(e.currentTarget.value))}
          onKeyUp={(e) => commit(Number(e.currentTarget.value))}
          aria-label="Mission day"
        />
        <div className="clock-marks" aria-hidden="true">
          <span style={{ left: at(0) }}>Launch</span>
          <span style={{ left: at(m.landingDay) }}>Landing</span>
          <span style={{ left: '100%', transform: 'translateX(-100%)' }}>R+180</span>
          <span style={{ left: 0, transform: 'none' }}>L-180</span>
        </div>
      </div>
    </div>
  );
}

export function LinkPill({ onOpen }) {
  const { connected } = useApp();
  const { link } = useStream();
  if (!connected) {
    return (
      <span className="link-pill"><span className="dot off" /> <b>Server offline</b> reconnecting…</span>
    );
  }
  if (!link) return null;
  return (
    <button className="link-pill" onClick={onOpen} title="Open Link & sync">
      <span className={`dot ${link.open ? 'live' : 'closed'}`} />
      <span><b>{link.open ? 'Radio window open' : 'Radio window closed'}</b> · {link.open ? 'closes' : 'opens'} in {link.secondsToChange}s</span>
      <span className="mono small">{link.queued} queued</span>
    </button>
  );
}

export function Toasts({ onOpen }) {
  const { toasts, dismiss } = useApp();
  return (
    <div className="toasts" aria-live="assertive">
      {toasts.map(({ id, alert }) => (
        <div key={id} className={`toast ${alert.level === 'WATCH' ? 'watch' : ''}`} role="alert">
          <LevelBadge level={alert.level} />
          <button className="btn ghost" style={{ padding: 0, textAlign: 'left', display: 'block' }} onClick={onOpen}>
            <div className="t-title">{alert.code} · {alert.title}</div>
            <div className="t-body">{alert.message}</div>
          </button>
          <button className="btn icon ghost" onClick={() => dismiss(id)} aria-label="Dismiss"><Icon name="x" size={14} /></button>
        </div>
      ))}
    </div>
  );
}

export function CrewPicker({ value, onChange, crew }) {
  const { state } = useApp();
  const codes = crew ?? state?.crew ?? [];
  return (
    <div className="chips" role="group" aria-label="Astronaut">
      {codes.map((c) => (
        <button key={c} className="chip" aria-pressed={c === value} onClick={() => onChange(c)}>
          <Icon name="eye" size={13} /> {c}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, unit, sub, icon }) {
  return (
    <div className="stat">
      <div className="stat-label">{icon && <Icon name={icon} size={14} />}{label}</div>
      <div className="stat-value">{value}{unit && <small>{unit}</small>}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, actions, children, className = '', style }) {
  return (
    <section className={`panel ${className}`} style={style}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Empty({ children }) {
  return <p className="muted small" style={{ padding: '18px 0' }}>{children}</p>;
}
