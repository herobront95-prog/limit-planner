from pydantic import BaseModel, Field, ConfigDict
from typing import List, Dict
import uuid
from datetime import datetime, timezone


class GlobalStockUpload(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    store_columns: List[str] = Field(default_factory=list)
    data: Dict[str, Dict[str, float]] = Field(default_factory=dict)


class StockHistoryEntry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    store_id: str
    store_name: str
    product: str
    stock: float
    recorded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
