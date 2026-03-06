from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path

from huggingface_hub import HfApi, create_repo


HF_REQUIREMENTS = "joblib==1.5.1\nnumpy==2.3.2\npandas==2.3.1\nscikit-learn==1.7.1\n"

HF_INFERENCE = '''from __future__ import annotations

import json
from pathlib import Path

import joblib
import pandas as pd


def _load_artifact(model_dir: str | Path):
    model_path = Path(model_dir) / "mindpulse_rf.joblib"
    raw = joblib.load(model_path)
    if isinstance(raw, dict) and "model" in raw:
        model = raw["model"]
        feature_names = raw.get(
            "feature_names",
            ["heart_rate", "hrv_rmssd", "motion_level", "hr_baseline", "rmssd_baseline"],
        )
        return model, feature_names
    return raw, ["heart_rate", "hrv_rmssd", "motion_level", "hr_baseline", "rmssd_baseline"]


def predict(model_dir: str, inputs: dict):
    model, feature_names = _load_artifact(model_dir)
    row = {name: float(inputs[name]) for name in feature_names}
    x = pd.DataFrame([row], columns=feature_names)
    score = float(model.predict(x)[0])
    score = max(0.0, min(1.0, score))
    return {"engagement_score": score}
'''


def build_model_card(repo_id: str) -> str:
    return f'''---
language:
- en
license: mit
library_name: scikit-learn
pipeline_tag: tabular-regression
tags:
- healthcare
- physiology
- wearable
- engagement
---

# MindPulse Engagement Model

This model predicts child engagement score (`0..1`) from wearable physiological features:

- `heart_rate`
- `hrv_rmssd`
- `motion_level`
- `hr_baseline`
- `rmssd_baseline`

## Training Target

- `engagement_score`

## Data Processing Logic

- `HR_norm = (heart_rate - hr_baseline) / hr_baseline`
- `RMSSD_norm = hrv_rmssd / rmssd_baseline`
- `arousal = normalize(HR_norm)`
- `valence = normalize(RMSSD_norm)`
- `engagement_score = arousal * valence` (bounded to `0..1`)

## Usage

Load `mindpulse_rf.joblib` and run prediction with all 5 input features.

Repository: https://huggingface.co/{repo_id}
'''


def main() -> None:
    parser = argparse.ArgumentParser(description="Publish MindPulse model to Hugging Face Hub")
    parser.add_argument("--repo-id", required=True, help="Hugging Face repo id, e.g. AtharvaXX/mindpulse")
    parser.add_argument("--model-path", default="models/mindpulse_rf.joblib", help="Path to trained model artifact")
    parser.add_argument("--private", action="store_true", help="Create a private model repository")
    parser.add_argument("--prepare-only", action="store_true", help="Prepare local upload bundle only")
    parser.add_argument("--local-dir", default=".hf_bundle", help="Local staging folder")
    parser.add_argument("--token", default=None, help="Optional HF token; otherwise use cached login/env token")
    args = parser.parse_args()
    resolved_token = args.token or os.getenv("HUGGINGFACE_HUB_TOKEN") or os.getenv("HF_TOKEN")

    model_path = Path(args.model_path)
    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    local_dir = Path(args.local_dir)
    if local_dir.exists():
        shutil.rmtree(local_dir)
    local_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy2(model_path, local_dir / "mindpulse_rf.joblib")
    (local_dir / "requirements.txt").write_text(HF_REQUIREMENTS, encoding="utf-8")
    (local_dir / "inference.py").write_text(HF_INFERENCE, encoding="utf-8")
    (local_dir / "README.md").write_text(build_model_card(args.repo_id), encoding="utf-8")
    (local_dir / "config.json").write_text(
        json.dumps(
            {
                "model_type": "random_forest_regressor",
                "input_features": [
                    "heart_rate",
                    "hrv_rmssd",
                    "motion_level",
                    "hr_baseline",
                    "rmssd_baseline",
                ],
                "target": "engagement_score",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    print(f"Prepared Hugging Face bundle at: {local_dir}")

    if args.prepare_only:
        print("Skipping upload because --prepare-only was provided.")
        return

    create_repo(repo_id=args.repo_id, repo_type="model", private=args.private, exist_ok=True, token=resolved_token)

    api = HfApi(token=resolved_token)
    for file_path in local_dir.rglob("*"):
        if not file_path.is_file():
            continue
        path_in_repo = file_path.relative_to(local_dir).as_posix()
        api.upload_file(
            path_or_fileobj=str(file_path),
            path_in_repo=path_in_repo,
            repo_id=args.repo_id,
            repo_type="model",
        )
    print(f"Upload complete: https://huggingface.co/{args.repo_id}")


if __name__ == "__main__":
    main()
