from fastapi.routing import APIRouter

from afya_space_api.web.api import afya, dummy, echo, monitoring

api_router = APIRouter()
api_router.include_router(monitoring.router)
api_router.include_router(echo.router, prefix="/echo", tags=["echo"])
api_router.include_router(dummy.router, prefix="/dummy", tags=["dummy"])
api_router.include_router(afya.router, tags=["afya-space"])
