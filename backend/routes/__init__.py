from fastapi import APIRouter

from .stores import router as stores_router
from .filters import router as filters_router
from .mappings import router as mappings_router
from .orders import router as orders_router
from .stock import router as stock_router

api_router = APIRouter(prefix="/api")

# Include all routers
api_router.include_router(stores_router, tags=["stores"])
api_router.include_router(filters_router, tags=["filters"])
api_router.include_router(mappings_router, tags=["mappings"])
api_router.include_router(orders_router, tags=["orders"])
api_router.include_router(stock_router, tags=["stock"])


@api_router.get("/")
async def root():
    return {"message": "Order Planning API"}
