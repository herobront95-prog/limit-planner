from fastapi import APIRouter, HTTPException
from typing import List
import uuid
from datetime import datetime, timezone

from database import db
from models import Store, StoreCreate, StoreUpdate, LimitBulkUpdate, LimitRenameRequest

router = APIRouter()


@router.get("/stores", response_model=List[Store])
async def get_stores():
    stores = await db.stores.find({}, {"_id": 0}).to_list(1000)
    return stores


@router.get("/stores/{store_id}", response_model=Store)
async def get_store(store_id: str):
    store = await db.stores.find_one({"id": store_id}, {"_id": 0})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    return store


@router.post("/stores", response_model=Store)
async def create_store(store_input: StoreCreate):
    store_dict = {"name": store_input.name, "limits": []}
    
    # Copy limits from another store if requested
    if store_input.copy_from_id:
        source_store = await db.stores.find_one({"id": store_input.copy_from_id})
        if source_store:
            store_dict["limits"] = source_store.get("limits", [])
    
    store = Store(**store_dict)
    store_dict = store.model_dump()
    store_dict["created_at"] = store_dict["created_at"].isoformat()
    await db.stores.insert_one(store_dict)
    return store


@router.put("/stores/{store_id}", response_model=Store)
async def update_store(store_id: str, store_update: StoreUpdate):
    update_data = {k: v for k, v in store_update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.stores.update_one(
        {"id": store_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    
    store = await db.stores.find_one({"id": store_id}, {"_id": 0})
    return store


@router.delete("/stores/{store_id}")
async def delete_store(store_id: str):
    result = await db.stores.delete_one({"id": store_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Store deleted successfully"}


@router.post("/stores/{store_id}/limits")
async def update_store_limits(store_id: str, limit_update: LimitBulkUpdate):
    # Apply to all stores - merge with existing limits
    if limit_update.apply_to_all:
        all_stores = await db.stores.find({}, {"_id": 0}).to_list(1000)
        
        for store in all_stores:
            existing_limits = {item['product']: item['limit'] for item in store.get('limits', [])}
            
            # Add/update new limits
            for new_limit in limit_update.limits:
                existing_limits[new_limit.product] = new_limit.limit
            
            merged_limits = [{"product": k, "limit": v} for k, v in existing_limits.items()]
            
            await db.stores.update_one(
                {"id": store["id"]},
                {"$set": {"limits": merged_limits}}
            )
        
        modified_count = len(all_stores)
        return {"message": f"Updated limits for {modified_count} stores"}
    
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


@router.put("/stores/{store_id}/limits/{product_name}")
async def update_single_limit(store_id: str, product_name: str, new_limit: int):
    from urllib.parse import unquote
    product_name = unquote(product_name)
    
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    limits = store.get('limits', [])
    found = False
    for limit in limits:
        if limit['product'] == product_name:
            limit['limit'] = new_limit
            found = True
            break
    
    if not found:
        limits.append({"product": product_name, "limit": new_limit})
    
    await db.stores.update_one(
        {"id": store_id},
        {"$set": {"limits": limits}}
    )
    return {"message": "Limit updated successfully"}


@router.put("/stores/{store_id}/limits/{product_name}/rename")
async def rename_limit(store_id: str, product_name: str, request: LimitRenameRequest):
    from urllib.parse import unquote
    product_name = unquote(product_name)
    
    store = await db.stores.find_one({"id": store_id})
    if not store:
        raise HTTPException(status_code=404, detail="Store not found")
    
    limits = store.get('limits', [])
    found = False
    for limit in limits:
        if limit['product'] == product_name:
            limit['product'] = request.new_name
            found = True
            break
    
    if not found:
        raise HTTPException(status_code=404, detail="Limit not found")
    
    await db.stores.update_one(
        {"id": store_id},
        {"$set": {"limits": limits}}
    )
    return {"message": "Limit renamed successfully"}


@router.delete("/stores/{store_id}/limits/{product_name}")
async def delete_limit(store_id: str, product_name: str, apply_to_all: bool = False):
    from urllib.parse import unquote
    product_name = unquote(product_name)
    
    if apply_to_all:
        result = await db.stores.update_many(
            {},
            {"$pull": {"limits": {"product": product_name}}}
        )
        return {"message": f"Limit deleted from {result.modified_count} stores"}
    
    result = await db.stores.update_one(
        {"id": store_id},
        {"$pull": {"limits": {"product": product_name}}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Store not found")
    return {"message": "Limit deleted successfully"}
