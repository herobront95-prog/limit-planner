from fastapi import APIRouter, HTTPException
from typing import List
import uuid
from datetime import datetime, timezone

from database import db
from models import ProductMapping, ProductMappingCreate, ProductMappingUpdate

router = APIRouter()


@router.get("/product-mappings", response_model=List[ProductMapping])
async def get_product_mappings():
    mappings = await db.product_mappings.find({}, {"_id": 0}).to_list(1000)
    return mappings


@router.post("/product-mappings", response_model=ProductMapping)
async def create_product_mapping(mapping_input: ProductMappingCreate):
    # Check if mapping with this main_product already exists
    existing = await db.product_mappings.find_one({"main_product": mapping_input.main_product})
    if existing:
        raise HTTPException(status_code=400, detail="Mapping for this product already exists")
    
    mapping = ProductMapping(**mapping_input.model_dump())
    mapping_dict = mapping.model_dump()
    mapping_dict["created_at"] = mapping_dict["created_at"].isoformat()
    await db.product_mappings.insert_one(mapping_dict)
    return mapping


@router.put("/product-mappings/{mapping_id}", response_model=ProductMapping)
async def update_product_mapping(mapping_id: str, mapping_update: ProductMappingUpdate):
    update_data = {k: v for k, v in mapping_update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    
    result = await db.product_mappings.update_one(
        {"id": mapping_id},
        {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Mapping not found")
    
    mapping = await db.product_mappings.find_one({"id": mapping_id}, {"_id": 0})
    return mapping


@router.delete("/product-mappings/{mapping_id}")
async def delete_product_mapping(mapping_id: str):
    result = await db.product_mappings.delete_one({"id": mapping_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Mapping not found")
    return {"message": "Mapping deleted successfully"}
