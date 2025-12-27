from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
import os
import logging

from database import create_indexes, close_db_connection
from routes import api_router

# Create FastAPI app
app = FastAPI(
    title="Order Planning API",
    description="API для планирования заказов и управления лимитами",
    version="1.0.0"
)

# Include API router
app.include_router(api_router)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logging configuration
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_event():
    """Initialize database indexes on startup"""
    await create_indexes()


@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown"""
    await close_db_connection()
