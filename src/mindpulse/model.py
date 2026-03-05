from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import pandas as pd

from .engagement import estimate_components


@dataclass
class Baseline:
    hr_baseline: float
    rmssd_baseline: float


class MindPulseModel:
    def __init__(self, baseline_file: str | Path, ml_model_file: str | Path | None = None) -> None:
        self.baseline_file = Path(baseline_file)
        self.baselines = self._load_baselines(self.baseline_file)
        self.ml_model = None
        self.feature_names = ["heart_rate", "hrv_rmssd", "motion_level", "hr_baseline", "rmssd_baseline"]
        if ml_model_file:
            self.ml_model, self.feature_names = self._load_ml_model(ml_model_file)

    @staticmethod
    def _load_baselines(path: Path) -> dict[str, Baseline]:
        raw = json.loads(path.read_text(encoding="utf-8"))
        baselines: dict[str, Baseline] = {}
        for user_id, values in raw.items():
            baselines[user_id] = Baseline(
                hr_baseline=float(values["hr_baseline"]),
                rmssd_baseline=float(values["rmssd_baseline"]),
            )
        return baselines

    @staticmethod
    def _load_ml_model(path: str | Path) -> tuple[Any, list[str]]:
        raw = joblib.load(path)
        if isinstance(raw, dict) and "model" in raw:
            feature_names = raw.get(
                "feature_names",
                ["heart_rate", "hrv_rmssd", "motion_level", "hr_baseline", "rmssd_baseline"],
            )
            return raw["model"], list(feature_names)

        # Backward-compatible loading for older model files without metadata.
        return raw, ["HR_norm", "RMSSD_norm", "motion_level"]

    def _get_baseline(self, user_id: str) -> Baseline:
        return self.baselines.get(user_id, self.baselines["default"])

    def predict(self, user_id: str, heart_rate: float, hrv_rmssd: float, motion_level: float) -> dict[str, float | str]:
        baseline = self._get_baseline(user_id)
        components = estimate_components(
            heart_rate=heart_rate,
            hrv_rmssd=hrv_rmssd,
            motion_level=motion_level,
            hr_baseline=baseline.hr_baseline,
            rmssd_baseline=baseline.rmssd_baseline,
        )

        if self.ml_model is None:
            model_score = components.engagement_score
        else:
            if self.feature_names == ["HR_norm", "RMSSD_norm", "motion_level"]:
                row = {
                    "HR_norm": components.hr_norm,
                    "RMSSD_norm": components.rmssd_norm,
                    "motion_level": motion_level,
                }
            else:
                row = {
                    "heart_rate": heart_rate,
                    "hrv_rmssd": hrv_rmssd,
                    "motion_level": motion_level,
                    "hr_baseline": baseline.hr_baseline,
                    "rmssd_baseline": baseline.rmssd_baseline,
                }
            features_df = pd.DataFrame([row], columns=self.feature_names)
            model_score = float(self.ml_model.predict(features_df)[0])
            model_score = max(0.0, min(1.0, model_score))

        return {
            "arousal": components.arousal,
            "valence": components.valence,
            "engagement_score": model_score,
            "context_note": components.context_note,
        }
