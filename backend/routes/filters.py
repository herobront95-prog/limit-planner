from fastapi import APIRouter, HTTPException
from typing import List
import uuid
from datetime import datetime, timezone

from database import db
from models import FilterExpression, FilterCreate

router = APIRouter()


@router.get("/filters", response_model=List[FilterExpression])
async def get_filters():
    filters = await db.filters.find({}, {"_id": 0}).to_list(1000)
    return filters


@router.post("/filters", response_model=FilterExpression)
async def create_filter(filter_input: FilterCreate):
    filter_expr = FilterExpression(**filter_input.model_dump())
    filter_dict = filter_expr.model_dump()
    filter_dict["created_at"] = filter_dict["created_at"].isoformat()
    await db.filters.insert_one(filter_dict)
    return filter_expr


@router.delete("/filters/{filter_id}")
async def delete_filter(filter_id: str):
    result = await db.filters.delete_one({"id": filter_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Filter not found")
    return {"message": "Filter deleted successfully"}
