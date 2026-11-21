// Records the data of a RUNNING onboard server for the static demo (GitHub Pages, no server):
//  - one JSON snapshot per GET endpoint used by the client  -> client/public/demo-data/<path>.json
//  - N consecutive 1 Hz live ticks (vitals + radio link)    -> client/public/demo-data/stream.json
// Usage: node scripts/export-static-demo.js [--api http://localhost:3001] [--ticks 60]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const API = arg('api', 'http://localhost:3001').replace(/\/$/, '');
const TICKS = Number(arg('ticks', 60));
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'public', 'demo-data');

const get = async (path) => {
  const res = await fetch(`${API}/api/v1${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  return res.json();
};
const save = (path, data) => {
  const file = join(OUT, `${path}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data));
};

const crew = await get('/crew');
const list = Array.isArray(crew) ? crew : crew.crew ?? crew.astronauts ?? [];
const codes = list.map((a) => a.code);
if (!codes.length) throw new Error('No astronaut found in /crew');

const paths = ['/state', '/crew', '/alerts', '/sync', '/model', '/nasa/tas', '/nasa/glds700', '/reports/crew', '/voice/log'];
for (const c of codes) paths.push(`/astronauts/${c}`, `/astronauts/${c}/risk`, `/reports/${c}`);

let ok = 0;
for (const p of paths) {
  try {
    save(p, await get(p));
    ok++;
  } catch (e) {
    console.warn(`skipped ${p}: ${e.message}`);
  }
}
console.log(`snapshots: ${ok}/${paths.length} (${codes.length} astronauts)`);

const ticks = await new Promise((resolve, reject) => {
  const got = [];
  const ws = new WebSocket(`${API.replace(/^http/, 'ws')}/stream`);
  const timer = setTimeout(() => (got.length ? resolve(got) : reject(new Error('no tick received'))), (TICKS + 15) * 1000);
  ws.on('message', (raw) => {
    const m = JSON.parse(raw);
    if (m.type !== 'tick') return;
    got.push({ crew: m.crew, link: m.link });
    if (got.length >= TICKS) {
      clearTimeout(timer);
      ws.close();
      resolve(got);
    }
  });
  ws.on('error', reject);
});
save('stream', ticks);
console.log(`stream: ${ticks.length} ticks`);
