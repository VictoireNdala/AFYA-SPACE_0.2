// Prioritised, compressed, persistent sync queue (write locally first, send when the link allows).
import { deflateSync, inflateSync } from 'node:zlib';

export const PRIORITY = { CRITICAL: 0, MEASUREMENT: 1, LOG: 2 };
export const PRIORITY_LABEL = ['Critical alerts', 'Measurements', 'Logs'];

/** Add an item. Returns false if an item with the same id is already queued (idempotent). */
export function enqueue(db, { id, priority, kind, summary, data }, now = Date.now()) {
  const raw = Buffer.from(JSON.stringify({ id, kind, data }));
  const payload = deflateSync(raw);
  const res = db
    .prepare('INSERT OR IGNORE INTO sync_items (id, priority, kind, summary, payload, bytes, raw_bytes, status, attempts, next_try, created_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)')
    .run(id, priority, kind, summary ?? kind, payload, payload.length, raw.length, 'queued', now);
  return res.changes > 0;
}

export const decode = (payload) => JSON.parse(inflateSync(Buffer.from(payload)).toString('utf8'));

/** Items ready to send, most critical first, oldest first within a priority. */
export function ready(db, now = Date.now(), limit = 200) {
  return db.prepare("SELECT * FROM sync_items WHERE status = 'queued' AND next_try <= ? ORDER BY priority, created_ts LIMIT ?").all(now, limit);
}

export function markAcked(db, id, now = Date.now()) {
  db.prepare("UPDATE sync_items SET status = 'acked', sent_ts = ?, acked_ts = ? WHERE id = ?").run(now, now, id);
}

/** Failed transmission: retry later with exponential backoff (1, 2, 4 ... seconds, capped). */
export function markFailed(db, id, now = Date.now(), maxBackoffSeconds = 8) {
  const row = db.prepare('SELECT attempts FROM sync_items WHERE id = ?').get(id);
  const attempts = (row?.attempts ?? 0) + 1;
  const wait = Math.min(2 ** (attempts - 1), maxBackoffSeconds) * 1000;
  db.prepare('UPDATE sync_items SET attempts = ?, next_try = ? WHERE id = ?').run(attempts, now + wait, id);
  return wait;
}

export function queueStats(db) {
  const byPriority = [0, 1, 2].map((p) => {
    const r = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes FROM sync_items WHERE status = 'queued' AND priority = ?").get(p);
    return { priority: p, label: PRIORITY_LABEL[p], count: r.n, bytes: r.bytes };
  });
  const tot = db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS bytes, COALESCE(SUM(raw_bytes), 0) AS raw FROM sync_items WHERE status = 'acked'").get();
  const retrying = db.prepare("SELECT COUNT(*) AS n FROM sync_items WHERE status = 'queued' AND attempts > 0").get().n;
  return {
    byPriority,
    queued: byPriority.reduce((a, b) => a + b.count, 0),
    queuedBytes: byPriority.reduce((a, b) => a + b.bytes, 0),
    acked: tot.n,
    ackedBytes: tot.bytes,
    compressionRatio: tot.raw ? Number((tot.raw / Math.max(1, tot.bytes)).toFixed(2)) : null,
    retrying,
  };
}

export function recentItems(db, limit = 12) {
  return db.prepare('SELECT id, priority, kind, summary, bytes, raw_bytes, status, attempts, created_ts, acked_ts FROM sync_items ORDER BY COALESCE(acked_ts, created_ts) DESC LIMIT ?').all(limit);
}
