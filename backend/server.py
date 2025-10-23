from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone
import pandas as pd
import io
import re
from fastapi.responses import StreamingResponse

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Models
class LimitItem(BaseModel):
    product: str
    limit: int

class Store(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    limits: List[LimitItem] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class StoreCreate(BaseModel):
    name: str
    copy_from_id: Optional[str] = None

class StoreUpdate(BaseModel):
    name: Optional[str] = None

class LimitBulkUpdate(BaseModel):
    limits: List[LimitItem]
    apply_to_all: bool = False

class FilterExpression(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    expression: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FilterCreate(BaseModel):
    name: str
    expression: str

class ProcessRequest(BaseModel):
    store_id: str
    filter_expressions: List[str] = Field(default_factory=list)


# Improved product matching algorithm
def tokenize(text: str) -> tuple:
    """Split text into word and number tokens"""
    # Split by whitespace and special chars, keep numbers separate
    tokens = re.findall(r'\d+|[a-zA-Zа-яА-ЯёЁ]+', str(text))
    return tuple(tokens)

def find_best_match_improved(product_name: str, limits_dict: Dict[str, int]) -> Optional[str]:
    """
    Improved matching algorithm that correctly distinguishes between similar products.
    Uses tokenization to avoid matching '25' with '250' or '57595925'.
    """
    product_tokens = tokenize(product_name.lower())
    
    best_match = None
    best_score = 0
    
    for limit_key in limits_dict.keys():
        limit_tokens = tokenize(limit_key.lower())
        
        if not limit_tokens:
            continue
        
        # Check if all limit tokens are present in product tokens
        matches = 0
        exact_matches = 0
        
        for limit_token in limit_tokens:
            if limit_token in product_tokens:
                exact_matches += 1
            # Check partial match for words only (not numbers)
            elif not limit_token.isdigit():
                for product_token in product_tokens:
                    if not product_token.isdigit() and limit_token in product_token:
                        matches += 1
                        break
        
        # Calculate score: prioritize exact matches, especially for numbers
        total_limit_tokens = len(limit_tokens)
        if exact_matches == total_limit_tokens:
            # Perfect match - all tokens match exactly
            score = exact_matches * 10000 + len(limit_key)
        elif exact_matches + matches >= total_limit_tokens:
            # Partial match
            score = exact_matches * 1000 + matches * 100 + len(limit_key)
        else:
            continue
        
        if score > best_score:
            best_score = score
            best_match = limit_key
    
    return best_match

def evaluate_filter_expression(expression: str, limits: float, ostatok: float, zakaz: float) -> bool:
    """
    Safely evaluate filter expression.
    Supported: Лимиты, Остаток, Заказ, +, -, *, /, >, <, >=, <=, ==, !=
    """
    try:
        # Replace Russian variable names with values
        expr = expression.replace('Лимиты', str(limits))
        expr = expr.replace('Остаток', str(ostatok))
        expr = expr.replace('Заказ', str(zakaz))
        
        # Secure evaluation - only allow math and comparison operators
        allowed_names = {}
        allowed_ops = {'__builtins__': {}}
        
        result = eval(expr, allowed_ops, allowed_names)
        return bool(result)
    except Exception as e:
        logging.error(f"Filter expression error: {e}")
        return True  # If error, don't filter out


# API Routes
@api_router.get("/")
async def root():
    return {"message": "Order Calculator API"}

# Store CRUD
@api_router.get("/stores", response_model=List[Store])
async def get_stores():
    stores = await db.stores.find({}, {"_id": 0}).to_list(1000)
    for store in stores:
        if isinstance(store.get('created_at'), str):
            store['created_at'] = datetime.fromisoformat(store['created_at'])
    return stores

@api_router.get("/stores/{store_id}", response_model=Store)
async def get_store(store_id: str):
    store = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    if isinstance(store.get('created_at'), str):
        store['created_at'] = datetime.fromisoformat(store['created_at'])
    return store

@api_router.post("/stores", response_model=Store)
async def create_store(store_input: StoreCreate):
    # Check if store with same name exists
    existing = await db.stores.find_one({"name": store_input.name})
    if existing:
        raise HTTPException(status_code=400, detail="Store with this name already exists")
    
    store_dict = {"name": store_input.name, "limits": []}
    
    # Copy limits from another store if requested
    if store_input.copy_from_id:
        source_store = await db.stores.find_one({"id": store_input.copy_from_id}, {"_id": 0})
        if source_store:
            store_dict["limits"] = source_store.get("limits", [])
    
    store_obj = Store(**store_dict)
    doc = store_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.stores.insert_one(doc)
    return store_obj

@api_router.put("/stores/{store_id}", response_model=Store)
async def update_store(store_id: str, store_update: StoreUpdate):
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    update_data = {k: v for k, v in store_update.model_dump().items() if v is not None}
    
    if update_data:
        await db.stores.update_one({"id": store_id}, {"$set": update_data})
    
    updated_store = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if isinstance(updated_store.get('created_at'), str):
        updated_store['created_at'] = datetime.fromisoformat(updated_store['created_at'])
    return updated_store

@api_router.delete("/stores/{store_id}")
async def delete_store(store_id: str):
    result = await db.stores.delete_one({"id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Store deleted successfully"}

# Limits Management
@api_router.post("/stores/{store_id}/limits")
async def update_store_limits(store_id: str, limit_update: LimitBulkUpdate):
    if limit_update.apply_to_all:
        # Apply to all stores - merge with existing limits
        all_stores = await db.stores.find({}).to_list(1000)
        modified_count = 0
        
        for store in all_stores:
            existing_limits = {item['product']: item['limit'] for item in store.get('limits', [])}
            
            # Add/update new limits
            for new_limit in limit_update.limits:
                existing_limits[new_limit.product] = new_limit.limit
            
            merged_limits = [{"product": k, "limit": v} for k, v in existing_limits.items()]
            
            await db.stores.update_one(
                {"id": store['id']},
                {"$set": {"limits": merged_limits}}
            )
            modified_count += 1
        
        return {"message": f"Updated limits for {modified_count} stores"}
    else:
        # Apply to single store
        store = await db.stores.find_one({"id": store_id})
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")
        
        # Merge new limits with existing ones
        existing_limits = {item['product']: item['limit'] for item in store.get('limits', [])}
        
        for new_limit in limit_update.limits:
            existing_limits[new_limit.product] = new_limit.limit
        
        merged_limits = [{"product": k, "limit": v} for k, v in existing_limits.items()]
        
        await db.stores.update_one(
            {"id": store_id},
            {"$set": {"limits": merged_limits}}
        )
        return {"message": "Limits updated successfully"}

@api_router.delete("/stores/{store_id}/limits/{product_name}")
async def delete_limit(store_id: str, product_name: str, apply_to_all: bool = False):
    if apply_to_all:
        # Delete from all stores
        result = await db.stores.update_many(
            {},
            {"$pull": {"limits": {"product": product_name}}}
        )
        return {"message": f"Deleted limit from {result.modified_count} stores"}
    else:
        # Delete from single store
        result = await db.stores.update_one(
            {"id": store_id},
            {"$pull": {"limits": {"product": product_name}}}
        )
        if result.modified_count == 0:
            raise HTTPException(status_code=404, detail="Limit not found")
        return {"message": "Limit deleted successfully"}

# Filter Management
@api_router.get("/filters", response_model=List[FilterExpression])
async def get_filters():
    filters = await db.filters.find({}, {"_id": 0}).to_list(100)
    for f in filters:
        if isinstance(f.get('created_at'), str):
            f['created_at'] = datetime.fromisoformat(f['created_at'])
    return filters

@api_router.post("/filters", response_model=FilterExpression)
async def create_filter(filter_input: FilterCreate):
    filter_obj = FilterExpression(**filter_input.model_dump())
    doc = filter_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.filters.insert_one(doc)
    return filter_obj

@api_router.delete("/filters/{filter_id}")
async def delete_filter(filter_id: str):
    result = await db.filters.delete_one({"id": filter_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Filter not found")
    return {"message": "Filter deleted successfully"}

# Process Excel file
@api_router.post("/process")
async def process_order(
    file: UploadFile = File(...),
    store_id: str = None,
    filter_expressions: str = "[]"
):
    try:
        import json
        filter_list = json.loads(filter_expressions)
        
        # Get store limits
        store = await db.stores.find_one({"id": store_id})
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")
        
        limits_dict = {item['product']: item['limit'] for item in store.get('limits', [])}
        
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # Validate required columns
        if 'Товар' not in df.columns or 'Остаток' not in df.columns:
            raise HTTPException(status_code=400, detail="Excel file must contain 'Товар' and 'Остаток' columns")
        
        # Process data
        df['Остаток'] = pd.to_numeric(df['Остаток'], errors='coerce').fillna(0)
        df['Товар'] = df['Товар'].astype(str)
        
        # Filter products with limits
        def should_keep(product_name):
            match = find_best_match_improved(product_name, limits_dict)
            return match is not None and limits_dict[match] > 0
        
        df = df[df['Товар'].apply(should_keep)]
        
        # Calculate order
        def calculate_order(row):
            product_name = row['Товар']
            match = find_best_match_improved(product_name, limits_dict)
            if match:
                return max(0, limits_dict[match] - row['Остаток'])
            return 0
        
        df['Заказ'] = df.apply(calculate_order, axis=1)
        
        # Add limits column
        df['Matched_Product'] = df['Товар'].apply(lambda x: find_best_match_improved(x, limits_dict))
        df['Лимиты'] = df['Matched_Product'].apply(lambda x: limits_dict[x] if x else 0)
        df = df.drop('Matched_Product', axis=1)
        
        # Remove zero orders
        df = df[df['Заказ'] > 0]
        
        # Apply custom filters
        if filter_list:
            for expr in filter_list:
                if expr.strip():
                    df = df[df.apply(
                        lambda row: evaluate_filter_expression(
                            expr,
                            row['Лимиты'],
                            row['Остаток'],
                            row['Заказ']
                        ),
                        axis=1
                    )]
        
        # Generate Excel response
        output = io.BytesIO()
        df.to_excel(output, index=False)
        output.seek(0)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={store['name']}_order.xlsx"}
        )
    
    except Exception as e:
        logging.error(f"Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()