from __future__ import annotations

from dataclasses import dataclass
from math import exp


def clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def normalize_hr(heart_rate: float, hr_baseline: float) -> float:
    return (heart_rate - hr_baseline) / hr_baseline


def normalize_rmssd(hrv_rmssd: float, rmssd_baseline: float) -> float:
    return (hrv_rmssd - rmssd_baseline) / rmssd_baseline


def sigmoid(value: float) -> float:
    # Clamp extreme ranges for numerical stability.
    bounded = max(-60.0, min(60.0, value))
    return 1.0 / (1.0 + exp(-bounded))


@dataclass
class EngagementComponents:
    hr_norm: float
    rmssd_norm: float
    arousal: float
    valence: float
    engagement_score: float
    context_note: str


def estimate_components(
    heart_rate: float,
    hrv_rmssd: float,
    motion_level: float,
    hr_baseline: float,
    rmssd_baseline: float,
) -> EngagementComponents:
    hr_norm = normalize_hr(heart_rate, hr_baseline)
    rmssd_norm = normalize_rmssd(hrv_rmssd, rmssd_baseline)

    arousal = sigmoid(hr_norm - rmssd_norm)
    valence = sigmoid(-motion_level)
    engagement_score = clip01(arousal * valence)

    context_note = infer_motion_context(heart_rate, motion_level, hr_baseline)
    return EngagementComponents(
        hr_norm=hr_norm,
        rmssd_norm=rmssd_norm,
        arousal=arousal,
        valence=valence,
        engagement_score=engagement_score,
        context_note=context_note,
    )


def infer_motion_context(heart_rate: float, motion_level: float, hr_baseline: float) -> str:
    hr_high = heart_rate > (hr_baseline * 1.15)
    motion_high = motion_level >= 0.6
    if hr_high and motion_high:
        return "High HR with high motion: likely physical activity context"
    if hr_high and not motion_high:
        return "High HR with low motion: possible psychological stress context"
    return "No strong physical-or-stress context override"
