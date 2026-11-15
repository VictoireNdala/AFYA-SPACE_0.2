import { useState } from 'react';
import { useApi } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import Icon, { LevelBadge } from '../components/Icon.jsx';
import { Panel, Empty, Stat } from '../components/chrome.jsx';
import { dayLabel, timeAgo } from '../lib/format.js';

const RULE_LABEL = {
  RETINA_DELTA_UM: 'Retinal thickness change',
  REFRACTION_DELTA_D: 'Refraction change',
  IOP_MMHG: 'Intraocular pressure',
  VENOUS_SIGNAL: 'Venous safety signal',
  ADHERENCE_30D: 'Supplement adherence',
  EXAM_OVERDUE: 'Exam overdue',
  PERSISTENT_CHANGE: 'Persistent change',
};

export default function Alerts() {
  const { data } = useApi('/alerts');
  const [level, setLevel] = useState('ALL');
  const [status, setStatus] = useState('OPEN');
  const [source, setSource] = useState('ALL');
  const [who, setWho] = useState('ALL');
  const [by, setBy] = useState('Flight surgeon');
  if (!data) return <Panel><Empty>Loading alerts…</Empty></Panel>;

  const all = [...data.live.map((a) => ({ ...a, acked: a.acked || a.resolved })), ...data.alerts];
  const codes = [...new Set(all.map((a) => a.code))].sort();
  const rows = all.filter((a) => (level === 'ALL' || a.level === level) && (status === 'ALL' || (status === 'OPEN' ? !a.acked : a.acked)) && (source === 'ALL' || a.source === source) && (who === 'ALL' || a.code === who));
  const openAll = all.filter((a) => !a.acked);
  const ack = (id) => post(`/alerts/${encodeURIComponent(id)}/ack`, { by }).catch(() => {});

  return (
    <div className="grid" style={{ gap: 20 }}>
      <div className="stats">
        <Stat icon="octagon" label="Urgent, open" value={openAll.filter((a) => a.level === 'URGENT').length} />
        <Stat icon="alert" label="Watch, open" value={openAll.filter((a) => a.level === 'WATCH').length} />
        <Stat icon="info" label="Info, open" value={openAll.filter((a) => a.level === 'INFO').length} />
        <Stat icon="check" label="Acknowledged" value={all.filter((a) => a.acked).length} />
      </div>

      <div className="row wrap" style={{ gap: 12 }}>
        <div className="seg" role="group" aria-label="Level">
          {['ALL', 'URGENT', 'WATCH', 'INFO'].map((l) => <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)}>{l === 'ALL' ? 'All levels' : l[0] + l.slice(1).toLowerCase()}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Status">
          {[['OPEN', 'Open'], ['ACKED', 'Acknowledged'], ['ALL', 'All']].map(([k, l]) => <button key={k} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}
        </div>
        <div className="seg" role="group" aria-label="Source">
          {[['ALL', 'All sources'], ['mission', 'SANS follow-up'], ['live', 'Live vitals']].map(([k, l]) => <button key={k} aria-pressed={source === k} onClick={() => setSource(k)}>{l}</button>)}
        </div>
        <select className="input" style={{ width: 150 }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Astronaut">
          <option value="ALL">All crew</option>
          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        <label className="row small soft">Acknowledge as <input className="input" style={{ width: 160 }} value={by} onChange={(e) => setBy(e.target.value)} /></label>
      </div>

      <Panel title={`${rows.length} alert${rows.length === 1 ? '' : 's'}`} subtitle="Alerts describe a reading and the rule it crossed. They never diagnose or prescribe. Thresholds are demo values set in protocol.json.">
        {rows.length === 0 ? <Empty>No alert matches these filters.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Level</th><th>Astronaut</th><th>When</th><th>Rule</th><th>Details</th><th className="num">Value</th><th className="num">Threshold</th><th>Status</th></tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} className={a.acked ? 'acked' : ''}>
                    <td><LevelBadge level={a.level} /></td>
                    <td><b>{a.code}</b></td>
                    <td className="mono small">{a.source === 'live' ? timeAgo(a.ts) : dayLabel(a.day)}</td>
                    <td className="small">{RULE_LABEL[a.rule] ?? a.title}</td>
                    <td className="small soft" style={{ maxWidth: 420 }}>{a.message}</td>
                    <td className="num">{a.value != null ? `${a.value}` : '–'}</td>
                    <td className="num soft">{a.threshold != null ? `${a.threshold} ${a.unit ?? ''}` : '–'}</td>
                    <td>
                      {a.acked ? (
                        <span className="small soft row" style={{ gap: 6 }}><Icon name="tick" size={13} /> {a.resolved ? 'Resolved' : a.ackedBy ?? 'Acknowledged'}</span>
                      ) : (
                        <button className="btn sm" onClick={() => ack(a.id)}>Acknowledge</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
