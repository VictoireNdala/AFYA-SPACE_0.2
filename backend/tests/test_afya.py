import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from starlette.routing import Match

from afya_space_api.services.hub import Hub
from afya_space_api.services.rules import evaluate
from afya_space_api.services.simulator import Simulator
from afya_space_api.web.application import get_app

BASELINE = {
    "hr": 62,
    "spo2": 98,
    "temp": 36.6,
    "sleep": 7.2,
    "stress": 25,
    "radiation": 30,
}


def _astronaut(activity: str = "repos", **vitals: float) -> dict:
    return {
        "activity": activity,
        "baseline": BASELINE,
        "vitals": {**BASELINE, **vitals},
    }


def test_rules_normal() -> None:
    result = evaluate(_astronaut())
    assert result["level"] == 0
    assert result["score"] == 0
    assert len(result["checks"]) == 6


def test_rules_thresholds() -> None:
    levels = {
        c["metric"]: c["level"]
        for c in evaluate(_astronaut(spo2=94, temp=39, radiation=120))["checks"]
    }
    assert levels["spo2"] == 1
    assert levels["temp"] == 2
    assert levels["radiation"] == 1


def test_rules_heart_rate_depends_on_activity() -> None:
    fast = {"hr": 62 + 75}
    assert evaluate(_astronaut("repos", **fast))["level"] == 2
    assert evaluate(_astronaut("exercice", **fast))["level"] == 1


def test_simulator_trigger() -> None:
    sim = Simulator()
    assert sim.trigger("hypoxie", "a2")
    assert not sim.trigger("inconnu")
    for _ in range(40):
        crew = sim.tick()
    assert [a["id"] for a in crew] == ["a1", "a2", "a3"]
    assert len(sim.history("a1")) == 40
    assert sim.history("nope") == []


def test_hub_emits_alert_then_recovery() -> None:
    hub = Hub()
    hub.simulator.trigger("hypoxie", "a1")
    seen = []
    for _ in range(60):
        seen += hub.step()
    alerts = [
        m["alert"]
        for m in seen
        if m["type"] == "alert" and m["alert"]["metric"] == "spo2"
    ]
    assert alerts[0]["level"] >= 1
    assert alerts[-1]["level"] == 0
    assert alerts[-1]["message"] == "Retour à la normale"
    assert seen[-1]["type"] == "tick"
    assert hub.recent_alerts()


@pytest.mark.anyio
async def test_rest_endpoints(fastapi_app: FastAPI, client: AsyncClient) -> None:
    ok = await client.post("/api/scenario/fievre", params={"target": "a3"})
    assert ok.status_code == 200
    assert ok.json() == {"ok": True}
    bad = await client.post("/api/scenario/nimporte")
    assert bad.status_code == 400
    for _ in range(30):
        fastapi_app.state.hub.step()
    alerts = (await client.get("/api/alerts")).json()
    assert any(a["metric"] == "temp" for a in alerts)
    assert (await client.get("/api/history/a1")).status_code == 200


class FakeWebSocket:
    """Faux WebSocket : enregistre ce que le serveur envoie."""

    def __init__(self) -> None:
        self.accepted = False
        self.sent: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)


@pytest.mark.anyio
async def test_hub_websocket_flow() -> None:
    """Un client reçoit ``init`` puis les ``tick`` diffusés ; la route /stream existe."""
    hub = Hub()
    ws = FakeWebSocket()
    await hub.connect(ws)  # type: ignore[arg-type]
    assert ws.accepted
    assert ws.sent[0]["type"] == "init"
    for message in hub.step():
        await hub.broadcast(message)
    tick = ws.sent[-1]
    assert tick["type"] == "tick"
    assert len(tick["crew"]) == 3
    assert {"level", "score", "alerts"} <= set(tick["crew"][0]["status"])
    hub.disconnect(ws)  # type: ignore[arg-type]
    await hub.broadcast({"type": "tick"})
    assert ws.sent[-1] is tick


def test_stream_route_registered() -> None:
    """Le WebSocket est exposé à la racine (/stream), comme l'ancien serveur Node."""
    scope = {"type": "websocket", "path": "/stream", "root_path": ""}
    matches = [r.matches(scope)[0] for r in get_app().routes]
    assert Match.FULL in matches
