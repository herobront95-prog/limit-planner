from fastapi import FastAPI, APIRouter, UploadFile, File, HTTPException, Query
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
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

class ProductMapping(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    main_product: str
    synonyms: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class ProductMappingCreate(BaseModel):
    main_product: str
    synonyms: List[str] = Field(default_factory=list)

class ProductMappingUpdate(BaseModel):
    main_product: Optional[str] = None
    synonyms: Optional[List[str]] = None

# New models for global stock and history
class GlobalStockUpload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    store_columns: List[str] = Field(default_factory=list)  # List of store names found in file
    data: Dict[str, Dict[str, float]] = Field(default_factory=dict)  # {product: {store_name: stock}}

class StockHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    store_id: str
    store_name: str
    product: str
    stock: float
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class OrderHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    store_id: str
    store_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    items: List[Dict[str, Any]] = Field(default_factory=list)  # [{product, stock, order, limit}]


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
        expr = expression.replace('Лимиты', str(limits))
        expr = expr.replace('Остаток', str(ostatok))
        expr = expr.replace('Заказ', str(zakaz))
        
        allowed_names = {}
        allowed_ops = {'__builtins__': {}}
        
        result = eval(expr, allowed_ops, allowed_names)
        return bool(result)
    except Exception as e:
        logging.error(f"Filter expression error: {e}")
        return True

async def apply_product_mappings(df: pd.DataFrame) -> pd.DataFrame:
    """
    Apply product mappings (synonyms) and merge rows with same products.
    Searches for synonyms as SUBSTRINGS and merges them.
    Keeps the FIRST found full product name (preserves original name for limit matching).
    Sums up stock values for merged products.
    """
    try:
        # Get all mappings
        mappings = await db.product_mappings.find({}, {"_id": 0}).to_list(1000)
        
        if not mappings:
            return df
        
        # Build list of (pattern, group_id) for grouping
        # All synonyms and main_product of same mapping get same group_id
        patterns = []
        for idx, mapping in enumerate(mappings):
            main_product = mapping['main_product']
            group_id = f"group_{idx}"
            # Add main product pattern
            patterns.append((main_product.lower().strip(), group_id))
            # Add all synonyms patterns
            for synonym in mapping.get('synonyms', []):
                patterns.append((synonym.lower().strip(), group_id))
        
        # Sort patterns by length (longest first) to match most specific first
        patterns.sort(key=lambda x: len(x[0]), reverse=True)
        
        # Find group for each product
        def find_group(product_name):
            product_lower = str(product_name).lower().strip()
            for pattern, group_id in patterns:
                if pattern in product_lower:
                    return group_id
            return None
        
        # Assign groups to products
        df['_group'] = df['Товар'].apply(find_group)
        
        # For products with same group - merge them
        result_rows = []
        processed_groups = set()
        
        for idx, row in df.iterrows():
            group = row['_group']
            
            if group is None:
                # No mapping - keep as is
                result_rows.append({
                    'Товар': row['Товар'],
                    'Остаток': row['Остаток']
                })
            elif group not in processed_groups:
                # First product of this group - merge all with same group
                group_df = df[df['_group'] == group]
                total_stock = group_df['Остаток'].sum()
                # Use the first product name (full original name)
                first_name = group_df.iloc[0]['Товар']
                
                logging.info(f"Merged {len(group_df)} products into '{first_name}' with total stock {total_stock}")
                
                result_rows.append({
                    'Товар': first_name,
                    'Остаток': total_stock
                })
                processed_groups.add(group)
        
        result_df = pd.DataFrame(result_rows)
        logging.info(f"Applied product mappings: {len(df)} rows -> {len(result_df)} rows")
        
        return result_df
    except Exception as e:
        logging.error(f"Error applying product mappings: {e}")
        return df


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

@api_router.put("/stores/{store_id}/limits/{product_name}")
async def update_single_limit(store_id: str, product_name: str, new_limit: int):
    """Update a single limit value"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    limits = store.get('limits', [])
    found = False
    
    for item in limits:
        if item['product'] == product_name:
            item['limit'] = new_limit
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Limit not found")
    
    await db.stores.update_one(
        {"id": store_id},
        {"$set": {"limits": limits}}
    )
    return {"message": "Limit updated successfully"}

class LimitRenameRequest(BaseModel):
    new_name: str

@api_router.put("/stores/{store_id}/limits/{product_name}/rename")
async def rename_limit(store_id: str, product_name: str, request: LimitRenameRequest):
    """Rename a limit's product name"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    limits = store.get('limits', [])
    found = False
    
    for item in limits:
        if item['product'] == product_name:
            item['product'] = request.new_name
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Limit not found")
    
    await db.stores.update_one(
        {"id": store_id},
        {"$set": {"limits": limits}}
    )
    return {"message": "Limit renamed successfully"}

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

# Process Text Data (pasted from clipboard)
class TextDataItem(BaseModel):
    product: str
    stock: float

class ProcessTextRequest(BaseModel):
    store_id: str
    data: List[TextDataItem] = Field(default_factory=list)
    filter_expressions: List[str] = Field(default_factory=list)
    use_global_stock: bool = False  # New: use global stock instead of provided data

@api_router.post("/process-text")
async def process_text_data(request: ProcessTextRequest):
    try:
        # Get store limits
        store = await db.stores.find_one({"id": request.store_id})
        if not store:
            raise HTTPException(status_code=404, detail="Store not found")
        
        limits_dict = {item['product']: item['limit'] for item in store.get('limits', [])}
        
        # Get data either from request or from global stock
        if request.use_global_stock:
            # Load from global stock
            global_stock = await db.global_stock.find_one({}, sort=[("uploaded_at", -1)])
            if not global_stock:
                raise HTTPException(status_code=400, detail="Нет загруженных общих остатков")
            
            store_name = store["name"]
            stock_data = global_stock.get("data", {})
            
            data_list = []
            for product, stores in stock_data.items():
                stock = stores.get(store_name, 0)
                data_list.append({"product": product, "stock": stock})
            
            if not data_list:
                raise HTTPException(status_code=400, detail=f"Нет данных для точки '{store_name}' в общих остатках")
            
            data_dict = {
                'Товар': [item["product"] for item in data_list],
                'Остаток': [item["stock"] for item in data_list]
            }
        else:
            # Use provided data
            data_dict = {
                'Товар': [item.product for item in request.data],
                'Остаток': [item.stock for item in request.data]
            }
        
        df = pd.DataFrame(data_dict)
        
        # Process data (same as Excel processing)
        df['Остаток'] = pd.to_numeric(df['Остаток'], errors='coerce').fillna(0)
        df['Товар'] = df['Товар'].astype(str)
        
        # Apply product mappings (merge synonyms and sum stock)
        df = await apply_product_mappings(df)
        
        # Save stock history
        for _, row in df.iterrows():
            history_entry = {
                "id": str(uuid.uuid4()),
                "store_id": store["id"],
                "store_name": store["name"],
                "product": row["Товар"],
                "stock": row["Остаток"],
                "recorded_at": datetime.now(timezone.utc).isoformat()
            }
            await db.stock_history.insert_one(history_entry)
        
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
        if request.filter_expressions:
            for expr in request.filter_expressions:
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
        
        # Check if empty
        if len(df) == 0:
            raise HTTPException(
                status_code=400, 
                detail="Не найдено товаров для заказа. Проверьте лимиты и названия товаров."
            )
        
        # Save order to history
        order_items = []
        for _, row in df.iterrows():
            order_items.append({
                "product": row["Товар"],
                "stock": float(row["Остаток"]),
                "order": float(row["Заказ"]),
                "limit": float(row["Лимиты"])
            })
        
        order_history = {
            "id": str(uuid.uuid4()),
            "store_id": store["id"],
            "store_name": store["name"],
            "created_at": datetime.now(timezone.utc).isoformat(),
            "items": order_items
        }
        await db.order_history.insert_one(order_history)
        
        # Generate Excel response
        output = io.BytesIO()
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        # URL encode filename
        from urllib.parse import quote
        filename = f"{store['name']}.xlsx"
        encoded_filename = quote(filename)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

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

# Product Mappings Management
@api_router.get("/product-mappings", response_model=List[ProductMapping])
async def get_product_mappings():
    mappings = await db.product_mappings.find({}, {"_id": 0}).to_list(1000)
    for m in mappings:
        if isinstance(m.get('created_at'), str):
            m['created_at'] = datetime.fromisoformat(m['created_at'])
    return mappings

@api_router.post("/product-mappings", response_model=ProductMapping)
async def create_product_mapping(mapping_input: ProductMappingCreate):
    # Check if main_product already exists
    existing = await db.product_mappings.find_one({"main_product": mapping_input.main_product})
    if existing:
        raise HTTPException(status_code=400, detail="Mapping for this product already exists")
    
    mapping_obj = ProductMapping(**mapping_input.model_dump())
    doc = mapping_obj.model_dump()
    doc['created_at'] = doc['created_at'].isoformat()
    
    await db.product_mappings.insert_one(doc)
    return mapping_obj

@api_router.put("/product-mappings/{mapping_id}", response_model=ProductMapping)
async def update_product_mapping(mapping_id: str, mapping_update: ProductMappingUpdate):
    mapping = await db.product_mappings.find_one({"id": mapping_id})
    if not mapping:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    update_data = {k: v for k, v in mapping_update.model_dump().items() if v is not None}
    
    if update_data:
        await db.product_mappings.update_one({"id": mapping_id}, {"$set": update_data})
    
    updated_mapping = await db.product_mappings.find_one({"id": mapping_id}, {"_id": 0})
    if isinstance(updated_mapping.get('created_at'), str):
        updated_mapping['created_at'] = datetime.fromisoformat(updated_mapping['created_at'])
    return updated_mapping

@api_router.delete("/product-mappings/{mapping_id}")
async def delete_product_mapping(mapping_id: str):
    result = await db.product_mappings.delete_one({"id": mapping_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return {"message": "Mapping deleted successfully"}

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
        
        # Apply product mappings (merge synonyms and sum stock)
        df = await apply_product_mappings(df)
        
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
        df.to_excel(output, index=False, engine='openpyxl')
        output.seek(0)
        
        # URL encode filename for proper handling of Cyrillic characters
        from urllib.parse import quote
        # Filename is just store name
        filename = f"{store['name']}.xlsx"
        encoded_filename = quote(filename)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    
    except Exception as e:
        logging.error(f"Processing error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== GLOBAL STOCK API ====================

@api_router.post("/global-stock/upload")
async def upload_global_stock(file: UploadFile = File(...)):
    """Upload global stock Excel file with columns: Товар, Store1, Store2, ..."""
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        # First column should be product name
        if len(df.columns) < 2:
            raise HTTPException(status_code=400, detail="File must have at least 2 columns: Товар and at least one store")
        
        product_col = df.columns[0]
        store_columns = list(df.columns[1:])
        
        # Build data dict
        data = {}
        for _, row in df.iterrows():
            product = str(row[product_col]).strip()
            if not product or product == 'nan':
                continue
            
            product_data = {}
            for store_col in store_columns:
                stock = row[store_col]
                if pd.notna(stock):
                    try:
                        product_data[str(store_col)] = float(stock)
                    except:
                        product_data[str(store_col)] = 0
                else:
                    product_data[str(store_col)] = 0
            
            data[product] = product_data
        
        # Save to database
        upload_record = {
            "id": str(uuid.uuid4()),
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
            "store_columns": store_columns,
            "data": data
        }
        
        await db.global_stock.insert_one(upload_record)
        
        # Also save to stock history for each store with change calculation
        for product, store_stocks in data.items():
            for store_name, stock in store_stocks.items():
                # Find store by name
                store = await db.stores.find_one({"name": store_name})
                if store:
                    # Get previous stock to calculate change (arrival)
                    prev_entry = await db.stock_history.find_one(
                        {"store_id": store["id"], "product": product},
                        {"_id": 0, "stock": 1},
                        sort=[("recorded_at", -1)]
                    )
                    
                    prev_stock = prev_entry.get("stock", 0) if prev_entry else 0
                    change = stock - prev_stock  # Positive = arrival, Negative = sold/used
                    
                    history_entry = {
                        "id": str(uuid.uuid4()),
                        "store_id": store["id"],
                        "store_name": store_name,
                        "product": product,
                        "stock": stock,
                        "prev_stock": prev_stock,
                        "change": change,  # Difference from previous stock
                        "recorded_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.stock_history.insert_one(history_entry)
        
        return {
            "message": "Global stock uploaded successfully",
            "products_count": len(data),
            "stores_found": store_columns
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Global stock upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/global-stock/latest")
async def get_latest_global_stock():
    """Get the most recent global stock upload"""
    record = await db.global_stock.find_one(
        {}, 
        {"_id": 0},
        sort=[("uploaded_at", -1)]
    )
    if not record:
        return None
    return record

@api_router.get("/global-stock/history")
async def get_global_stock_history():
    """Get history of all global stock uploads (without full data)"""
    records = await db.global_stock.find(
        {},
        {"_id": 0, "id": 1, "uploaded_at": 1, "store_columns": 1}
    ).sort("uploaded_at", -1).to_list(100)
    return records

@api_router.get("/global-stock/{stock_id}")
async def get_global_stock_by_id(stock_id: str):
    """Get specific global stock upload by ID"""
    record = await db.global_stock.find_one({"id": stock_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Stock record not found")
    return record


# ==================== STOCK HISTORY API ====================

@api_router.get("/stores/{store_id}/stock-history")
async def get_store_stock_history(
    store_id: str,
    period: str = Query("week", enum=["day", "week", "month", "year"])
):
    """Get stock history for a store with aggregated data per product including latest stock and change"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now - timedelta(days=1)
    elif period == "week":
        start_date = now - timedelta(weeks=1)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:  # year
        start_date = now - timedelta(days=365)
    
    # Use aggregation pipeline to get latest entry for each product efficiently
    pipeline = [
        {"$match": {"store_id": store_id}},
        {"$sort": {"recorded_at": -1}},
        {"$group": {
            "_id": "$product",
            "latest_stock": {"$first": "$stock"},
            "prev_stock": {"$first": {"$ifNull": ["$prev_stock", 0]}},
            "change": {"$first": {"$ifNull": ["$change", 0]}},
            "last_updated": {"$first": "$recorded_at"}
        }},
        {"$project": {
            "_id": 0,
            "product": "$_id",
            "latest_stock": 1,
            "prev_stock": 1,
            "change": 1,
            "last_updated": 1
        }},
        {"$sort": {"product": 1}}
    ]
    
    products_data = await db.stock_history.aggregate(pipeline).to_list(10000)
    
    return {
        "store_name": store["name"],
        "period": period,
        "products": products_data,
        "start_date": start_date.isoformat(),
        "end_date": now.isoformat()
    }

@api_router.get("/stores/{store_id}/stock-history/{product}")
async def get_product_stock_history(
    store_id: str,
    product: str,
    period: str = Query("week", enum=["day", "week", "month", "year"])
):
    """Get stock history for a specific product in a store"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Calculate date range
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now - timedelta(days=1)
    elif period == "week":
        start_date = now - timedelta(weeks=1)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:  # year
        start_date = now - timedelta(days=365)
    
    from urllib.parse import unquote
    product_decoded = unquote(product)
    
    # Get stock history
    stock_records = await db.stock_history.find(
        {
            "store_id": store_id,
            "product": product_decoded,
            "recorded_at": {"$gte": start_date.isoformat()}
        },
        {"_id": 0}
    ).sort("recorded_at", 1).to_list(1000)
    
    # Get order history for this product
    order_records = await db.order_history.find(
        {
            "store_id": store_id,
            "created_at": {"$gte": start_date.isoformat()}
        },
        {"_id": 0, "created_at": 1, "items": 1}
    ).sort("created_at", 1).to_list(1000)
    
    # Extract order data for this product
    orders_data = []
    for order in order_records:
        for item in order.get("items", []):
            if item.get("product") == product_decoded:
                orders_data.append({
                    "date": order["created_at"],
                    "order": item.get("order", 0)
                })
                break
    
    return {
        "product": product_decoded,
        "store_name": store["name"],
        "period": period,
        "stock_history": stock_records,
        "order_history": orders_data
    }


# ==================== ORDER HISTORY API ====================

@api_router.get("/stores/{store_id}/orders")
async def get_store_orders(store_id: str):
    """Get order history for a store"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    orders = await db.order_history.find(
        {"store_id": store_id},
        {"_id": 0, "id": 1, "store_name": 1, "created_at": 1, "items": 1}
    ).sort("created_at", -1).to_list(1000)
    
    # Add items count to each order
    for order in orders:
        order["items_count"] = len(order.get("items", []))
    
    return orders

@api_router.get("/stores/{store_id}/orders/{order_id}")
async def get_order_details(store_id: str, order_id: str):
    """Get details of a specific order"""
    order = await db.order_history.find_one(
        {"store_id": store_id, "id": order_id},
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.get("/stores/{store_id}/orders/{order_id}/download")
async def download_order(store_id: str, order_id: str):
    """Download order as Excel file with formatted output"""
    order = await db.order_history.find_one(
        {"store_id": store_id, "id": order_id},
        {"_id": 0}
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    store = await db.stores.find_one({"id": store_id})
    store_name = store["name"] if store else "Заказ"
    
    # Create DataFrame with only store_name and order columns
    items = order.get("items", [])
    df = pd.DataFrame([
        {store_name: item.get("product", ""), "Заказ": item.get("order", 0)}
        for item in items
    ])
    
    # Generate Excel with bold formatting
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Заказ')
        
        # Apply bold formatting
        workbook = writer.book
        worksheet = writer.sheets['Заказ']
        from openpyxl.styles import Font
        bold_font = Font(bold=True)
        
        for row in worksheet.iter_rows():
            for cell in row:
                cell.font = bold_font
    
    output.seek(0)
    
    from urllib.parse import quote
    filename = f"{store_name}.xlsx"
    encoded_filename = quote(filename)
    
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )


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