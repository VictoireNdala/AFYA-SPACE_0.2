// Ground station: receives items over the (simulated) radio link and stores them in ground.db.
// Idempotent by item id, so a retransmitted packet is acknowledged again but stored once.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.js';
import { crc32 } from 'node:zlib';
import { decode } from './queue.js';

export class GroundStation {
  constructor(file = join(DATA_DIR, 'ground.db')) {
    if (file !== ':memory:') mkdirSync(DATA_DIR, { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec('CREATE TABLE IF NOT EXISTS received (id TEXT PRIMARY KEY, kind TEXT, priority INTEGER, summary TEXT, payload TEXT, bytes INTEGER, received_ts INTEGER)');
    this.duplicates = 0;
    this.rejected = 0;
  }

  /** Verify the frame CRC32, store the item and return an acknowledgement. Damaged frames are rejected (no ack). */
  receive(item, now = Date.now()) {
    if (item.crc != null && crc32(Buffer.from(item.payload)) !== item.crc) {
      this.rejected += 1;
      return { ack: false, reason: 'crc', id: item.id };
    }
    const body = decode(item.payload);
    const res = this.db
      .prepare('INSERT OR IGNORE INTO received VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(item.id, item.kind, item.priority, item.summary, JSON.stringify(body.data), item.bytes, now);
    if (res.changes === 0) this.duplicates += 1;
    return { ack: true, id: item.id, duplicate: res.changes === 0 };
  }

  count() {
    return this.db.prepare('SELECT COUNT(*) AS n FROM received').get().n;
  }

  latest(limit = 8) {
    return this.db.prepare('SELECT id, kind, priority, summary, bytes, received_ts FROM received ORDER BY received_ts DESC LIMIT ?').all(limit);
  }

  reset() {
    this.db.exec('DELETE FROM received');
    this.duplicates = 0;
    this.rejected = 0;
  }
}
