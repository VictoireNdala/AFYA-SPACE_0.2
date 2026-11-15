import { usePoll } from '../lib/live.jsx';
import { post } from '../lib/api.js';
import Icon from '../components/Icon.jsx';
import { Panel, Empty, Stat } from '../components/chrome.jsx';
import { ChartFrame, C } from '../charts/core.jsx';
import { SegmentedBar } from '../charts/small.jsx';
import { BytesChart, QueueChart } from '../charts/live.jsx';
import { bytes, timeAgo } from '../lib/format.js';

// Ordinal ramp for priorities (validated on dark): brighter = more urgent.
const P_COLOR = ['#9cc2e6', '#4a8ac6', '#2a5f94'];
const P_INK = ['#0b0c0e', '#ffffff', '#ffffff'];
const P_LABEL = ['Critical alerts', 'Measurements', 'Logs'];

const FLOW = [
  ['mic', 'Astronaut', 'Voice or touch'],
  ['database', 'Onboard store', 'SQLite, written first'],
  ['sliders', 'Priority queue', 'zlib-compressed'],
  ['radio', 'Radio window', 'Limited bytes/s, packet loss'],
  ['satellite', 'Ground station', 'ground.db, idempotent ack'],
];

export default function LinkSync() {
  const s = usePoll('/sync', 1000);
  if (!s) return <Panel><Empty>Connecting to the link simulator…</Empty></Panel>;
  const w = s.window;
  const q = s.queue;
  const L = s.link;

  return (
    <div className="grid" style={{ gap: 20 }}>
      <Panel className="flat">
        <div className="row wrap" style={{ justifyContent: 'space-between', gap: 8 }}>
          {FLOW.map(([icon, title, sub], i) => (
            <div key={title} className="row" style={{ gap: 10 }}>
              <span className="badge neutral" style={{ padding: 8, borderRadius: 10 }}><Icon name={icon} size={16} /></span>
              <div><div style={{ fontWeight: 600, fontSize: 13 }}>{title}</div><div className="small muted">{sub}</div></div>
              {i < FLOW.length - 1 && <Icon name="chevron" size={16} className="muted" />}
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="flat">
        <div className="row wrap" style={{ gap: 18, justifyContent: 'space-between' }}>
          <div>
            <div className="eyebrow">Distance to the ground station</div>
            <p className="soft small" style={{ marginTop: 4 }}>Delay = distance ÷ speed of light + processing ± jitter. Every frame carries a CRC32; frames damaged by noise are rejected and resent.</p>
          </div>
          <div className="row wrap" style={{ gap: 12 }}>
            <div className="seg" role="group" aria-label="Distance profile">
              {Object.entries(L.profiles).map(([k, v]) => (
                <button key={k} aria-pressed={L.profile === k} onClick={() => post('/sync/profile', { profile: k }).catch(() => {})} title={v.label}>{k === 'ISS' ? 'ISS' : k === 'MOON' ? 'Moon' : 'Mars'}</button>
              ))}
            </div>
            <span className="small soft num">{L.distanceKm.toLocaleString('en-US')} km · light time {L.propagationS >= 60 ? `${(L.propagationS / 60).toFixed(1)} min` : `${L.propagationS < 0.01 ? (L.propagationS * 1000).toFixed(1) + ' ms' : L.propagationS.toFixed(2) + ' s'}`}</span>
          </div>
        </div>
      </Panel>
      <div className="stats">
        <div className="stat">
          <div className="stat-label"><span className={`dot ${w.open ? 'live' : 'closed'}`} /> Radio window</div>
          <div className="stat-value">{w.open ? 'Open' : 'Closed'}</div>
          <div className="stat-sub">{w.open ? 'Closes' : 'Opens'} in {w.secondsToChange}s{w.forced ? ' · forced by operator' : ''}</div>
        </div>
        <Stat icon="sliders" label="Waiting onboard" value={q.queued} unit="items" sub={bytes(q.queuedBytes)} />
        <Stat icon="send" label="Delivered to ground" value={s.ground.received} unit="items" sub={`${bytes(s.totals.bytesSent)} transmitted`} />
        <Stat icon="wifioff" label="Packets lost" value={s.totals.packetsLost} sub={`${Math.round(s.config.packetLoss * 100)}% simulated loss · retried with backoff`} />
        <Stat icon="shield" label="Frames damaged by noise" value={s.totals.framesCorrupted} sub={`CRC32 rejected at the ground (${Math.round((s.config.corruption ?? 0) * 100)}% noise)`} />
        <Stat icon="clock" label="One-way latency" value={s.totals.avgLatencyS != null ? (s.totals.avgLatencyS >= 60 ? `${(s.totals.avgLatencyS / 60).toFixed(1)}` : s.totals.avgLatencyS.toFixed(2)) : '–'} unit={s.totals.avgLatencyS >= 60 ? 'min' : 's'} sub={`${s.inFlight} frame(s) or acks in flight`} />
        <Stat icon="database" label="Compression" value={q.compressionRatio ? `${q.compressionRatio}×` : '–'} sub="JSON → zlib" />
      </div>

      <div className="grid g-12">
        <Panel className="span-8">
          <ChartFrame
            title="Downlink traffic"
            subtitle={`Bytes sent per second, last ${s.history.length} s. Shaded bands are radio windows. Budget ${s.config.bandwidthBytesPerSec} B/s.`}
            actions={<button className="btn sm primary" onClick={() => post('/sync/flush').catch(() => {})}><Icon name="send" size={13} /> Open window now</button>}
            footer={<span>{s.config.label}</span>}
          >
            <BytesChart history={s.history} />
          </ChartFrame>
          <hr className="divider" />
          <ChartFrame title="Items waiting onboard" subtitle="The queue grows between passes and drains during a window, critical items first.">
            <QueueChart history={s.history} />
          </ChartFrame>
        </Panel>

        <Panel className="span-4" title="Queue by priority" subtitle="Strict order: critical alerts, then measurements, then logs.">
          <SegmentedBar parts={q.byPriority.map((p) => ({ label: P_LABEL[p.priority], value: p.count, color: P_COLOR[p.priority], ink: P_INK[p.priority] }))} emptyLabel="Queue empty: everything delivered" />
          <div className="legend" style={{ marginTop: 10 }}>
            {q.byPriority.map((p) => (
              <span key={p.priority}><i className="key-box" style={{ background: P_COLOR[p.priority] }} />{P_LABEL[p.priority]} · {p.count}</span>
            ))}
          </div>
          <hr className="divider" />
          <div className="eyebrow" style={{ marginBottom: 6 }}>Last transmissions</div>
          {s.events.length === 0 && <Empty>Nothing sent yet in this session.</Empty>}
          <div className="list" style={{ maxHeight: 280, overflowY: 'auto' }}>
            {s.events.slice(0, 10).map((e, i) => (
              <div key={`${e.id}-${i}`} className="list-item" style={{ padding: '7px 2px' }}>
                <span className={`badge ${e.result === 'acked' ? 'good' : 'watch'}`}><Icon name={e.result === 'acked' ? 'tick' : 'refresh'} size={12} />{e.result === 'acked' ? 'Ack' : e.result === 'corrupted' ? 'CRC fail' : 'Lost'}</span>
                <div className="grow">
                  <div className="title truncate" style={{ fontSize: 12.5 }}>{e.summary ?? e.id}</div>
                  <div className="sub">{P_LABEL[e.priority]}{e.retryIn ? ` · retry in ${e.retryIn}s` : ''}{e.latency != null ? ` · ${e.latency >= 60 ? `${(e.latency / 60).toFixed(1)} min` : `${e.latency.toFixed(2)} s`} one way` : ''}{e.result === 'corrupted' ? ' · damaged by noise, resent' : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid g-2">
        <Panel title="Onboard queue" subtitle="Most recent items. Written locally first, so nothing is lost when the link is down.">
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Item</th><th>Priority</th><th className="num">Size</th><th className="num">Tries</th><th>Status</th></tr></thead>
              <tbody>
                {s.recent.map((r) => (
                  <tr key={r.id}>
                    <td className="small truncate" style={{ maxWidth: 260 }}>{r.summary}</td>
                    <td><span className="row small" style={{ gap: 6 }}><i className="key-box" style={{ background: P_COLOR[r.priority] }} />{P_LABEL[r.priority]}</span></td>
                    <td className="num small">{r.bytes} B</td>
                    <td className="num small">{r.attempts}</td>
                    <td><span className={`badge ${r.status === 'acked' ? 'good' : 'neutral'}`}>{r.status === 'acked' ? 'Delivered' : 'Queued'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Ground station" subtitle={`Received and stored in ground.db. Duplicates ignored: ${s.ground.duplicates}.`}>
          {s.ground.latest.length === 0 && <Empty>Waiting for the first pass.</Empty>}
          <div className="list">
            {s.ground.latest.map((g) => (
              <div key={g.id} className="list-item">
                <span className="badge good"><Icon name="satellite" size={12} /></span>
                <div className="grow">
                  <div className="title truncate" style={{ fontSize: 13 }}>{g.summary}</div>
                  <div className="sub">{P_LABEL[g.priority]} · {g.bytes} B · {timeAgo(g.received_ts)}</div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}
