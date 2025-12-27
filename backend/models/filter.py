from pydantic import BaseModel, Field, ConfigDict
import uuid
from datetime import datetime, timezone


class FilterExpression(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    expression: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FilterCreate(BaseModel):
    name: str
    expression: str
