from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict, Any, Optional
import uuid
from datetime import datetime, timezone


class OrderHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    store_id: str
    store_name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    items: List[Dict[str, Any]] = Field(default_factory=list)


class TextDataItem(BaseModel):
    product: str
    stock: float


class ProcessTextRequest(BaseModel):
    store_id: str
    data: List[TextDataItem] = Field(default_factory=list)
    filter_expressions: List[str] = Field(default_factory=list)
    use_global_stock: bool = False
    seller_request: Optional[str] = None


class ProcessRequest(BaseModel):
    store_id: str
    filter_expressions: List[str] = Field(default_factory=list)
