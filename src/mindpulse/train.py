from __future__ import annotations

import argparse
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split


REQUIRED_COLUMNS = [
    "heart_rate",
    "hrv_rmssd",
    "motion_level",
    "hr_baseline",
    "rmssd_baseline",
    "engagement_score",
]

FEATURE_COLUMNS = [
    "heart_rate",
    "hrv_rmssd",
    "motion_level",
    "hr_baseline",
    "rmssd_baseline",
]


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    return df[FEATURE_COLUMNS].copy()


def main() -> None:
    parser = argparse.ArgumentParser(description="Train MindPulse RandomForestRegressor")
    parser.add_argument("--data", required=True, help="Path to training CSV")
    parser.add_argument("--model-out", default="models/mindpulse_rf.joblib", help="Path for saved model")
    args = parser.parse_args()

    csv_path = Path(args.data)
    model_path = Path(args.model_out)

    df = pd.read_csv(csv_path)
    missing = [c for c in REQUIRED_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns: {missing}")

    X = build_features(df)
    y = df["engagement_score"].clip(0.0, 1.0)

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestRegressor(
        n_estimators=300,
        max_depth=10,
        min_samples_leaf=3,
        random_state=42,
    )
    model.fit(X_train, y_train)

    pred = model.predict(X_test)
    mae = mean_absolute_error(y_test, pred)
    r2 = r2_score(y_test, pred)

    model_path.parent.mkdir(parents=True, exist_ok=True)
    artifact = {
        "model": model,
        "feature_names": FEATURE_COLUMNS,
    }
    joblib.dump(artifact, model_path)

    print(f"Model saved to: {model_path}")
    print(f"MAE: {mae:.4f}")
    print(f"R2: {r2:.4f}")


if __name__ == "__main__":
    main()
