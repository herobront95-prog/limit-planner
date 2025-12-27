from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone


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
