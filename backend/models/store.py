from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


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


class LimitRenameRequest(BaseModel):
    new_name: str
