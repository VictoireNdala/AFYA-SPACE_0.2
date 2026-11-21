// Moteur de démonstration exécuté DANS le navigateur (GitHub Pages n'héberge pas de serveur).
// Il réutilise le simulateur et les règles du serveur Node : même comportement que server/index.js.
import { createSimulator } from '../../server/simulator.js';
import { evaluate } from '../../server/rules.js';

export function createDemoEngine({ onTick, onAlert }) {
  const sim = createSimulator();
  const lastLevels = new Map();
  let timer = null;

  const step = () => {
    const ts = Date.now();
    const crew = sim.tick().map((a) => {
      const status = evaluate(a);
      for (const c of status.checks) {
        const key = `${a.id}:${c.metric}`;
        const prev = lastLevels.get(key) ?? 0;
        if (c.level !== prev) {
          lastLevels.set(key, c.level);
          onAlert({
            ts,
            astronautId: a.id,
            astronaut: a.name,
            metric: c.metric,
            label: c.label,
            level: c.level,
            message: c.level ? c.message : 'Retour à la normale',
            action: c.level ? c.action : '',
          });
        }
      }
      return {
        ...a,
        status: { level: status.level, score: status.score, alerts: status.checks.filter((c) => c.level > 0) },
      };
    });
    onTick(ts, crew);
  };

  return {
    start() {
      step();
      timer = setInterval(step, 1000);
    },
    stop() {
      clearInterval(timer);
    },
    trigger: (name, targetId) => sim.trigger(name, targetId),
  };
}
