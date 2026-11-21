from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from afya_space_api.services.hub import Hub
from afya_space_api.settings import settings
from afya_space_api.web.api.afya import ws_router
from afya_space_api.web.api.router import api_router
from afya_space_api.web.lifespan import lifespan_setup


def get_app() -> FastAPI:
    """
    Get FastAPI application.

    This is the main constructor of an application.

    :return: application.
    """
    app = FastAPI(
        title="afya_space_api",
        lifespan=lifespan_setup,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Simulateur + règles + diffusion temps réel (boucle lancée dans le lifespan).
    app.state.hub = Hub(tick_interval=settings.tick_interval)

    # Main router for the API.
    app.include_router(router=api_router, prefix="/api")
    # WebSocket à la racine (/stream), comme l'ancien serveur Node.
    app.include_router(ws_router)

    return app
