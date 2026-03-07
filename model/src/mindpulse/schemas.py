from datetime import datetime
from pydantic import BaseModel, Field


class SensorPayload(BaseModel):
    user_id: str = Field(..., description="Unique child identifier")
    activity: str = Field(..., description="Current hobby or activity name")
    heart_rate: float = Field(..., ge=40, le=200, description="Current heart rate in bpm")
    hrv_rmssd: float = Field(..., gt=0, description="RMSSD value in milliseconds")
    motion_level: float = Field(..., description="Motion intensity from accelerometer")
    timestamp: datetime


class EngagementOutput(BaseModel):
    user_id: str
    activity: str
    engagement_score: float
    arousal: float
    valence: float
    timestamp: datetime
    context_note: str
