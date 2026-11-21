"""Routes propres à Afya Space (alertes, scénarios, flux temps réel)."""

from afya_space_api.web.api.afya.views import router, ws_router

__all__ = ["router", "ws_router"]
