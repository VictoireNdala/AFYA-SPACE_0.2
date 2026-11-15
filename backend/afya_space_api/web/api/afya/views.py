from typing import Any

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from afya_space_api.services.hub import Hub

router = APIRouter()
ws_router = APIRouter()


@router.get("/alerts")
def list_alerts(request: Request) -> list[dict[str, Any]]:
    """Les 100 dernières alertes."""
    hub: Hub = request.app.state.hub
    return hub.recent_alerts(100)


@router.post("/scenario/{name}")
def trigger_scenario(
    name: str, request: Request, target: str | None = None
) -> JSONResponse:
    """
    Déclenche un scénario de test sur un astronaute.

    Scénarios : exercice, hypoxie, radiation, fatigue, fievre.
    """
    hub: Hub = request.app.state.hub
    ok = hub.simulator.trigger(name, target)
    return JSONResponse({"ok": ok}, status_code=200 if ok else 400)


@router.get("/history/{astronaut_id}")
def history(astronaut_id: str, request: Request) -> list[dict[str, Any]]:
    """Historique récent des constantes d'un astronaute."""
    hub: Hub = request.app.state.hub
    return hub.simulator.history(astronaut_id)


@ws_router.websocket("/stream")
async def stream(websocket: WebSocket) -> None:
    """Flux temps réel : messages ``init``, ``tick`` et ``alert``."""
    hub: Hub = websocket.app.state.hub
    await hub.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
