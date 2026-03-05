from pathlib import Path

from fastapi import FastAPI

from src.mindpulse.model import MindPulseModel
from src.mindpulse.schemas import EngagementOutput, SensorPayload


BASELINE_PATH = Path("config/baselines.json")
MODEL_PATH = Path("models/mindpulse_rf.joblib")

app = FastAPI(title="MindPulse Engagement Detection API", version="1.0.0")

mindpulse = MindPulseModel(
    baseline_file=BASELINE_PATH,
    ml_model_file=MODEL_PATH if MODEL_PATH.exists() else None,
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/predict", response_model=EngagementOutput)
def predict(payload: SensorPayload) -> EngagementOutput:
    result = mindpulse.predict(
        user_id=payload.user_id,
        heart_rate=payload.heart_rate,
        hrv_rmssd=payload.hrv_rmssd,
        motion_level=payload.motion_level,
    )

    return EngagementOutput(
        user_id=payload.user_id,
        activity=payload.activity,
        engagement_score=round(float(result["engagement_score"]), 4),
        arousal=round(float(result["arousal"]), 4),
        valence=round(float(result["valence"]), 4),
        timestamp=payload.timestamp,
        context_note=str(result["context_note"]),
    )
