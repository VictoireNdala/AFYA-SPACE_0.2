import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { createSimulator } from './simulator.js';
import { evaluate } from './rules.js';

const app = express();
app.use(cors());
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

const sim = createSimulator();
const alertLog = [];
const lastLevels = new Map();

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/alerts', (_req, res) => res.json(alertLog.slice(-100)));
app.post('/api/scenario/:name', (req, res) => {
  const ok = sim.trigger(req.params.name, req.query.target);
  res.status(ok ? 200 : 400).json({ ok });
});

function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach((c) => c.readyState === 1 && c.send(data));
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'init', alerts: alertLog.slice(-50) }));
});

setInterval(() => {
  const ts = Date.now();
  const crew = sim.tick().map((a) => {
    const status = evaluate(a);
    for (const c of status.checks) {
      const key = `${a.id}:${c.metric}`;
      const prev = lastLevels.get(key) ?? 0;
      if (c.level !== prev) {
        lastLevels.set(key, c.level);
        const entry = {
          ts,
          astronautId: a.id,
          astronaut: a.name,
          metric: c.metric,
          label: c.label,
          level: c.level,
          message: c.level ? c.message : 'Retour à la normale',
          action: c.level ? c.action : '',
        };
        alertLog.push(entry);
        if (alertLog.length > 500) alertLog.shift();
        broadcast({ type: 'alert', alert: entry });
      }
    }
    return {
      ...a,
      status: { level: status.level, score: status.score, alerts: status.checks.filter((c) => c.level > 0) },
    };
  });
  broadcast({ type: 'tick', ts, crew });
}, 1000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Afya Space server : http://localhost:${PORT}`));