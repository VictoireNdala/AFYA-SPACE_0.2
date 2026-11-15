// Simulated low-bandwidth radio link: periodic communication windows, limited bytes per second,
// random packet loss, radio noise and distance-dependent latency. Items flow by priority; each frame carries a
// CRC32 so the ground rejects frames damaged by noise; anything not acknowledged is retried with backoff.
// Channel model (delay = distance / c + processing ± jitter, loss, bit-flip noise, CRC32 frames) adapted from
// the team's Python MQTT simulation in tools/radio-mqtt.
import { crc32 } from 'node:zlib';
import { ready, markAcked, markFailed, queueStats } from './queue.js';

export const SPEED_OF_LIGHT_KM_S = 299_792.458;
export const DISTANCE_PROFILES = {
  ISS: { label: 'Low Earth orbit (ISS)', km: 400 },
  MOON: { label: 'Moon (Gateway, Artemis)', km: 384_400 },
  MARS: { label: 'Mars at closest approach', km: 54_600_000 },
};

/** Flip one bit in 1-3 random bytes (radio noise). */
export function corrupt(buf, random = Math.random) {
  const out = Buffer.from(buf);
  const n = Math.min(out.length, 1 + Math.floor(random() * 3));
  const used = new Set();
  while (used.size < n) used.add(Math.floor(random() * out.length));
  for (const i of used) out[i] ^= 1 << Math.floor(random() * 8);
  return out;
}

export class RadioLink {
  /**
   * @param {{db: any, transport: {send(frame: any, now: number): {ack: boolean, reason?: string}}, config: any, now?: number, random?: () => number}} opts
   */
  constructor({ db, transport, config, now = Date.now(), random = Math.random }) {
    this.db = db;
    this.transport = transport;
    this.cfg = { distanceKm: 0, processingDelaySeconds: 0, jitterSeconds: 0, corruption: 0, ...config };
    this.profile = this.cfg.profile ?? null;
    this.epoch = now;
    this.random = random;
    this.credit = 0;
    this.forcedUntil = 0;
    this.totals = { bytesSent: 0, itemsAcked: 0, packetsLost: 0, framesCorrupted: 0, latencySumS: 0, latencyN: 0 };
    this.history = [];
    this.lastEvents = [];
    this.inFlight = []; // frames travelling to the ground
    this.acks = []; // acknowledgements travelling back
  }

  setProfile(name) {
    const p = DISTANCE_PROFILES[name];
    if (!p) return false;
    this.profile = name;
    this.cfg.distanceKm = p.km;
    return true;
  }

  /** One-way delay in seconds: propagation at the speed of light + processing ± jitter. */
  oneWayDelay() {
    const jitter = this.cfg.jitterSeconds > 0 ? (this.random() * 2 - 1) * this.cfg.jitterSeconds : 0;
    return Math.max(0, this.cfg.distanceKm / SPEED_OF_LIGHT_KM_S + this.cfg.processingDelaySeconds + jitter);
  }

  windowState(now = Date.now()) {
    const { openSeconds, periodSeconds } = this.cfg;
    const t = (((now - this.epoch) / 1000) % periodSeconds + periodSeconds) % periodSeconds;
    const forced = now < this.forcedUntil;
    const open = forced || t < openSeconds;
    const secondsToChange = forced ? Math.ceil((this.forcedUntil - now) / 1000) : open ? Math.ceil(openSeconds - t) : Math.ceil(periodSeconds - t);
    return { open, forced, secondsToChange, openSeconds, periodSeconds };
  }

  /** Force the window open (operator "flush now"). */
  forceOpen(seconds = 10, now = Date.now()) {
    this.forcedUntil = now + seconds * 1000;
  }

  #arrive(frame, now, events) {
    const res = this.transport.send(frame, now);
    if (!res?.ack) {
      if (res?.reason === 'crc') {
        this.totals.framesCorrupted += 1;
        events.push({ id: frame.id, priority: frame.priority, result: 'corrupted', summary: frame.summary });
      }
      return; // no ack: the onboard side retries after its ack timeout
    }
    const back = frame.delay; // the acknowledgement takes the same path back
    this.totals.latencySumS += frame.delay;
    this.totals.latencyN += 1;
    if (back <= 0) this.#ack(frame, now, events);
    else this.acks.push({ frame, at: now + back * 1000 });
  }

  #ack(frame, now, events) {
    markAcked(this.db, frame.id, now);
    this.totals.itemsAcked += 1;
    events.push({ id: frame.id, priority: frame.priority, result: 'acked', summary: frame.summary, latency: Number(frame.delay.toFixed(3)) });
  }

  /** Advance the link by `dt` seconds. Returns what was sent during this tick. */
  tick(now = Date.now(), dt = 1) {
    const st = this.windowState(now);
    const events = [];
    let bytes = 0;

    // Frames and acknowledgements still travelling arrive regardless of the onboard window.
    const arriving = this.inFlight.filter((f) => f.at <= now);
    this.inFlight = this.inFlight.filter((f) => f.at > now);
    for (const f of arriving) this.#arrive(f.frame, now, events);
    const acked = this.acks.filter((a) => a.at <= now);
    this.acks = this.acks.filter((a) => a.at > now);
    for (const a of acked) this.#ack(a.frame, now, events);

    if (!st.open) {
      this.credit = 0;
    } else {
      const travelling = new Set([...this.inFlight.map((f) => f.frame.id), ...this.acks.map((a) => a.frame.id)]);
      const items = ready(this.db, now).filter((i) => !travelling.has(i.id));
      const cap = Math.max(this.cfg.bandwidthBytesPerSec * 2, items[0]?.bytes ?? 0);
      this.credit = Math.min(this.credit + this.cfg.bandwidthBytesPerSec * dt, cap);
      for (const item of items) {
        if (item.bytes > this.credit) break; // keep strict priority order: wait for more credit
        this.credit -= item.bytes;
        bytes += item.bytes;
        this.totals.bytesSent += item.bytes;
        const delay = this.oneWayDelay();
        // Until an ack comes back, the item is retried after a timeout (round trip + margin, with backoff).
        const wait = markFailed(this.db, item.id, now, this.cfg.maxBackoffSeconds);
        this.db.prepare('UPDATE sync_items SET next_try = ? WHERE id = ?').run(now + Math.max(wait, (2 * delay + 2) * 1000), item.id);
        if (this.random() < this.cfg.packetLoss) {
          this.totals.packetsLost += 1;
          events.push({ id: item.id, priority: item.priority, result: 'lost', retryIn: Math.round(Math.max(wait / 1000, 2 * delay + 2)) });
          continue;
        }
        const raw = Buffer.from(item.payload);
        const frame = { id: item.id, priority: item.priority, kind: item.kind, summary: item.summary, bytes: item.bytes, crc: crc32(raw), payload: raw, delay };
        if (this.cfg.corruption > 0 && this.random() < this.cfg.corruption) frame.payload = corrupt(raw, this.random);
        if (delay <= 0) this.#arrive(frame, now, events);
        else this.inFlight.push({ frame, at: now + delay * 1000 });
      }
    }
    const q = queueStats(this.db);
    this.history.push({ t: now, bytes, open: st.open, queued: q.queued });
    if (this.history.length > 150) this.history.shift();
    if (events.length) this.lastEvents = [...events, ...this.lastEvents].slice(0, 20);
    return { window: st, bytes, events };
  }

  status(now = Date.now()) {
    const t = this.totals;
    return {
      window: this.windowState(now),
      totals: { ...t, avgLatencyS: t.latencyN ? Number((t.latencySumS / t.latencyN).toFixed(3)) : null },
      queue: queueStats(this.db),
      inFlight: this.inFlight.length + this.acks.length,
      link: { profile: this.profile, distanceKm: this.cfg.distanceKm, propagationS: Number((this.cfg.distanceKm / SPEED_OF_LIGHT_KM_S).toFixed(4)), profiles: DISTANCE_PROFILES },
      history: this.history,
      events: this.lastEvents,
      config: this.cfg,
    };
  }
}
