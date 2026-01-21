from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from typing import List
import logging
import uuid
import io
import pandas as pd
from datetime import datetime, timezone, timedelta
from urllib.parse import unquote

from database import db

router = APIRouter()


@router.post("/global-stock/upload")
async def upload_global_stock(
    file: UploadFile = File(...),
    stock_date: str = Query(None, description="Date for the stock in ISO format (YYYY-MM-DD). Defaults to today.")
):
    """Upload global stock Excel file with columns: Товар, Store1, Store2, ..."""
    try:
        # Parse stock date or use current date
        if stock_date:
            try:
                parsed_date = datetime.fromisoformat(stock_date.replace('Z', '+00:00'))
                if parsed_date.tzinfo is None:
                    parsed_date = parsed_date.replace(tzinfo=timezone.utc)
            except:
                parsed_date = datetime.now(timezone.utc)
        else:
            parsed_date = datetime.now(timezone.utc)
        
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents))
        
        if len(df.columns) < 2:
            raise HTTPException(status_code=400, detail="File must have at least 2 columns")
        
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
            "stock_date": parsed_date.isoformat(),
            "store_columns": store_columns,
            "data": data
        }
        
        await db.global_stock.insert_one(upload_record)
        
        # Load all stores and create name->id mapping
        all_stores = await db.stores.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(1000)
        store_map = {s["name"]: s["id"] for s in all_stores}
        
        # Filter to only stores that exist in database
        valid_store_columns = [col for col in store_columns if col in store_map]
        
        if not valid_store_columns:
            return {
                "message": "Global stock uploaded but no matching stores found",
                "products_count": len(data),
                "stores_found": store_columns,
                "stock_date": parsed_date.isoformat()
            }
        
        # Get all previous stocks
        prev_stocks_pipeline = [
            {"$match": {"store_id": {"$in": list(store_map.values())}}},
            {"$sort": {"recorded_at": -1}},
            {"$group": {
                "_id": {"store_id": "$store_id", "product": "$product"},
                "prev_stock": {"$first": "$stock"}
            }}
        ]
        prev_stocks_result = await db.stock_history.aggregate(prev_stocks_pipeline).to_list(None)
        
        prev_stocks_map = {}
        for item in prev_stocks_result:
            key = (item["_id"]["store_id"], item["_id"]["product"])
            prev_stocks_map[key] = item["prev_stock"]
        
        # Batch insert all history entries
        history_entries = []
        recorded_at_str = parsed_date.isoformat()
        
        for product, store_stocks in data.items():
            for store_name in valid_store_columns:
                store_id = store_map[store_name]
                stock = store_stocks.get(store_name, 0)
                
                prev_stock = prev_stocks_map.get((store_id, product), 0)
                change = stock - prev_stock
                
                history_entries.append({
                    "id": str(uuid.uuid4()),
                    "store_id": store_id,
                    "store_name": store_name,
                    "product": product,
                    "stock": stock,
                    "prev_stock": prev_stock,
                    "change": change,
                    "recorded_at": recorded_at_str
                })
        
        if history_entries:
            await db.stock_history.insert_many(history_entries)
        
        logging.info(f"Global stock uploaded: {len(data)} products, {len(valid_store_columns)} stores, {len(history_entries)} entries")
        
        return {
            "message": "Global stock uploaded successfully",
            "products_count": len(data),
            "stores_found": valid_store_columns,
            "entries_created": len(history_entries),
            "stock_date": parsed_date.isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Global stock upload error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/global-stock/latest")
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


@router.get("/global-stock/history")
async def get_global_stock_history():
    """Get history of all global stock uploads"""
    records = await db.global_stock.find(
        {},
        {"_id": 0, "id": 1, "uploaded_at": 1, "stock_date": 1, "store_columns": 1}
    ).sort("uploaded_at", -1).to_list(100)
    return records


@router.get("/global-stock/{stock_id}")
async def get_global_stock_by_id(stock_id: str):
    """Get specific global stock upload by ID"""
    record = await db.global_stock.find_one({"id": stock_id}, {"_id": 0})
    if not record:
        raise HTTPException(status_code=404, detail="Stock record not found")
    return record


@router.get("/stores/{store_id}/stock-history")
async def get_store_stock_history(
    store_id: str,
    period: str = Query("week", enum=["day", "week", "month", "year"])
):
    """Get stock history for a store"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now - timedelta(days=1)
    elif period == "week":
        start_date = now - timedelta(weeks=1)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:
        start_date = now - timedelta(days=365)
    
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


@router.get("/stores/{store_id}/stock-history/{product}")
async def get_product_stock_history(
    store_id: str,
    product: str,
    period: str = Query("week", enum=["day", "week", "month", "year"])
):
    """Get stock history for a specific product"""
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    now = datetime.now(timezone.utc)
    if period == "day":
        start_date = now - timedelta(days=1)
    elif period == "week":
        start_date = now - timedelta(weeks=1)
    elif period == "month":
        start_date = now - timedelta(days=30)
    else:
        start_date = now - timedelta(days=365)
    
    product_decoded = unquote(product)
    
    stock_records = await db.stock_history.find(
        {
            "store_id": store_id,
            "product": product_decoded,
            "recorded_at": {"$gte": start_date.isoformat()}
        },
        {"_id": 0}
    ).sort("recorded_at", 1).to_list(1000)
    
    order_records = await db.order_history.find(
        {
            "store_id": store_id,
            "created_at": {"$gte": start_date.isoformat()}
        },
        {"_id": 0, "created_at": 1, "items": 1}
    ).sort("created_at", 1).to_list(1000)
    
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


@router.get("/stores/{store_id}/new-products")
async def get_new_products(store_id: str):
    """
    Get products that are on Электро (stock >= 3) but not in store limits or have limit = 0.
    Excludes products in the global blacklist.
    Returns products that could be added to limits.
    """
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    # Get latest global stock
    global_stock = await db.global_stock.find_one({}, sort=[("uploaded_at", -1)])
    if not global_stock:
        return {"new_products": [], "message": "Нет загруженных общих остатков"}
    
    stock_data = global_stock.get("data", {})
    
    # Get store limits as a dict
    limits_dict = {item['product']: item['limit'] for item in store.get('limits', [])}
    
    # Get global blacklist (not tied to any store)
    blacklist_doc = await db.product_blacklist.find_one({"_type": "global"})
    blacklist = set(blacklist_doc.get("products", [])) if blacklist_doc else set()
    
    # Find products on Электро with stock >= 3 that are not in limits or have limit = 0
    new_products = []
    for product, stores in stock_data.items():
        # Skip if in blacklist
        if product in blacklist:
            continue
            
        electro_stock = stores.get("Электро", 0)
        
        # Only consider products with Электро stock >= 3
        if electro_stock < 3:
            continue
        
        # Check if product is not in limits or has limit = 0
        current_limit = limits_dict.get(product, None)
        if current_limit is None or current_limit == 0:
            new_products.append({
                "product": product,
                "electro_stock": electro_stock,
                "current_limit": current_limit
            })
    
    # Sort by product name
    new_products.sort(key=lambda x: x["product"])
    
    return {
        "new_products": new_products,
        "total_count": len(new_products),
        "store_name": store["name"]
    }


# ==================== PRODUCT BLACKLIST API ====================

from pydantic import BaseModel
from typing import List

class BlacklistAddRequest(BaseModel):
    product: str

class BlacklistRemoveRequest(BaseModel):
    product: str


@router.get("/blacklist")
async def get_blacklist():
    """Get global blacklisted products"""
    blacklist_doc = await db.product_blacklist.find_one({"_type": "global"})
    products = blacklist_doc.get("products", []) if blacklist_doc else []
    
    return {
        "products": products,
        "count": len(products)
    }


@router.post("/blacklist/add")
async def add_to_blacklist(request: BlacklistAddRequest):
    """Add a product to the global blacklist"""
    # Upsert: add to set if not exists
    await db.product_blacklist.update_one(
        {"_type": "global"},
        {"$addToSet": {"products": request.product}},
        upsert=True
    )
    
    return {"message": "Product added to blacklist"}


@router.post("/blacklist/remove")
async def remove_from_blacklist(request: BlacklistRemoveRequest):
    """Remove a product from the global blacklist"""
    await db.product_blacklist.update_one(
        {"_type": "global"},
        {"$pull": {"products": request.product}}
    )
    
    return {"message": "Product removed from blacklist"}


