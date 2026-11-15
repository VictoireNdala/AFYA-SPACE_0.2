// Regenerate the simulated crew dataset (deterministic for a given seed).
// Usage: npm run simulate -- --n 6 --seed 42
import { openDb, seed } from '../src/db.js';
import { GroundStation } from '../src/sync/ground.js';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? Number(args[i + 1]) : fallback;
};

const n = arg('n', 6);
const s = arg('seed', 42);
const data = seed(openDb(), { n, seed: s });
new GroundStation().reset();
console.log(`Simulated ${data.astronauts.length} astronauts (seed ${s}): ${data.measurements.length} measurements, ${data.symptoms.length} vision logs, ${data.supplements.length} supplement records, ${data.sessions.length} sessions.`);
console.log('All data is SIMULATED. Restart the server to pick it up.');
