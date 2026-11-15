"""Hub temps réel : simulateur + règles + journal d'alertes + diffusion WebSocket.

Port de la boucle ``setInterval`` de ``server/index.js``.
"""

import asyncio
import contextlib
import time
from collections import deque
from typing import Any

from fastapi import WebSocket

from afya_space_api.services.rules import evaluate
from afya_space_api.services.simulator import Simulator

ALERT_LOG_SIZE = 500
INIT_ALERTS = 50


class Hub:
    """Fait tourner le simulateur et diffuse ticks et alertes aux clients."""

    def __init__(self, tick_interval: float = 1.0) -> None:
        self.tick_interval = tick_interval
        self.simulator = Simulator()
        self.alert_log: deque[dict[str, Any]] = deque(maxlen=ALERT_LOG_SIZE)
        self._last_levels: dict[str, int] = {}
        self._clients: set[WebSocket] = set()
        self._task: asyncio.Task[None] | None = None

    def step(self) -> list[dict[str, Any]]:
        """
        Avance d'un tick et renvoie les messages à diffuser.

        Les messages ``alert`` (changements de niveau) précèdent le message ``tick``.
        """
        ts = int(time.time() * 1000)
        messages: list[dict[str, Any]] = []
        crew: list[dict[str, Any]] = []
        for astronaut in self.simulator.tick():
            status = evaluate(astronaut)
            for check in status["checks"]:
                key = f"{astronaut['id']}:{check['metric']}"
                previous = self._last_levels.get(key, 0)
                if check["level"] != previous:
                    self._last_levels[key] = check["level"]
                    entry = {
                        "ts": ts,
                        "astronautId": astronaut["id"],
                        "astronaut": astronaut["name"],
                        "metric": check["metric"],
                        "label": check["label"],
                        "level": check["level"],
                        "message": check["message"]
                        if check["level"]
                        else "Retour à la normale",
                        "action": check["action"] if check["level"] else "",
                    }
                    self.alert_log.append(entry)
                    messages.append({"type": "alert", "alert": entry})
            crew.append(
                {
                    **astronaut,
                    "status": {
                        "level": status["level"],
                        "score": status["score"],
                        "alerts": [c for c in status["checks"] if c["level"] > 0],
                    },
                }
            )
        messages.append({"type": "tick", "ts": ts, "crew": crew})
        return messages

    def recent_alerts(self, count: int = 100) -> list[dict[str, Any]]:
        """Dernières alertes (les plus anciennes d'abord)."""
        return list(self.alert_log)[-count:]

    async def connect(self, websocket: WebSocket) -> None:
        """Accepte un client et lui envoie l'état initial."""
        await websocket.accept()
        self._clients.add(websocket)
        await websocket.send_json(
            {"type": "init", "alerts": self.recent_alerts(INIT_ALERTS)}
        )

    def disconnect(self, websocket: WebSocket) -> None:
        """Retire un client."""
        self._clients.discard(websocket)

    async def broadcast(self, message: dict[str, Any]) -> None:
        """Envoie un message à tous les clients connectés."""
        for client in list(self._clients):
            try:
                await client.send_json(message)
            except Exception:
                self._clients.discard(client)

    async def _run(self) -> None:
        while True:
            for message in self.step():
                await self.broadcast(message)
            await asyncio.sleep(self.tick_interval)

    def start(self) -> None:
        """Démarre la boucle de simulation."""
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        """Arrête la boucle de simulation."""
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None
