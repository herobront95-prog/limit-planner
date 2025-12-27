from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def create_indexes():
    """Create database indexes for faster queries"""
    try:
        # Stock history indexes for fast lookups
        await db.stock_history.create_index([("store_id", 1), ("product", 1), ("recorded_at", -1)])
        await db.stock_history.create_index([("store_id", 1), ("recorded_at", -1)])
        await db.stock_history.create_index([("recorded_at", -1)])
        
        # Order history indexes
        await db.order_history.create_index([("store_id", 1), ("created_at", -1)])
        
        # Stores index
        await db.stores.create_index([("name", 1)])
        
        logging.info("Database indexes created successfully")
    except Exception as e:
        logging.error(f"Error creating indexes: {e}")


async def close_db_connection():
    """Close database connection"""
    client.close()
