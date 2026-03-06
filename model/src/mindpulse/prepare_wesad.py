from __future__ import annotations

import argparse
import pickle
from pathlib import Path

import kagglehub
import numpy as np
import pandas as pd
from scipy.signal import find_peaks


DEFAULT_ECG_FS = 700
DEFAULT_WINDOW_SEC = 30
DEFAULT_STEP_SEC = 5
DEFAULT_NEUTRAL_LABELS = [1]


def clip01(value: float) -> float:
    return max(0.0, min(1.0, value))


def scale_to_unit(value: float, lower: float, upper: float) -> float:
    if upper <= lower:
        raise ValueError("upper must be greater than lower")
    return clip01((value - lower) / (upper - lower))


def compute_hr_and_rmssd(ecg_segment: np.ndarray, fs: int) -> tuple[float, float] | None:
    if ecg_segment.size < fs:
        return None

    x = ecg_segment.astype(np.float64)
    std = float(np.std(x))
    if std <= 1e-6:
        return None

    x = (x - float(np.mean(x))) / std
    peaks, _ = find_peaks(x, distance=int(0.3 * fs), prominence=0.3)
    if peaks.size < 3:
        return None

    rr_ms = np.diff(peaks) * (1000.0 / fs)
    if rr_ms.size < 2:
        return None

    mean_rr = float(np.mean(rr_ms))
    if mean_rr <= 1e-6:
        return None

    heart_rate = 60000.0 / mean_rr
    rmssd = float(np.sqrt(np.mean(np.diff(rr_ms) ** 2))) if rr_ms.size >= 2 else float("nan")

    if not np.isfinite(heart_rate) or not np.isfinite(rmssd) or rmssd <= 0:
        return None
    return heart_rate, rmssd


def window_subject_data(
    ecg: np.ndarray,
    acc_xyz: np.ndarray,
    labels: np.ndarray,
    subject_id: str,
    fs: int,
    window_sec: int,
    step_sec: int,
) -> list[dict[str, float | int | str]]:
    win = window_sec * fs
    step = step_sec * fs
    n = min(ecg.shape[0], acc_xyz.shape[0], labels.shape[0])

    rows: list[dict[str, float | int | str]] = []
    for start in range(0, max(1, n - win + 1), step):
        end = start + win
        if end > n:
            break

        ecg_seg = ecg[start:end]
        acc_seg = acc_xyz[start:end, :]
        label_seg = labels[start:end]

        hr_rmssd = compute_hr_and_rmssd(ecg_seg, fs)
        if hr_rmssd is None:
            continue

        heart_rate, hrv_rmssd = hr_rmssd
        motion_level = float(np.mean(np.sqrt(np.sum(np.square(acc_seg), axis=1))))

        # Window label uses the most frequent label in the segment.
        label_values, label_counts = np.unique(label_seg.astype(int), return_counts=True)
        label_majority = int(label_values[np.argmax(label_counts)])

        rows.append(
            {
                "subject_id": subject_id,
                "label": label_majority,
                "heart_rate": heart_rate,
                "hrv_rmssd": hrv_rmssd,
                "motion_level": motion_level,
            }
        )
    return rows


def load_wesad_subject_rows(dataset_root: Path, fs: int, window_sec: int, step_sec: int) -> pd.DataFrame:
    rows: list[dict[str, float | int | str]] = []
    pkl_files = sorted(dataset_root.rglob("S*.pkl"))
    if not pkl_files:
        raise FileNotFoundError(f"No WESAD subject .pkl files found under: {dataset_root}")

    for pkl_path in pkl_files:
        subject_id = pkl_path.stem
        with pkl_path.open("rb") as f:
            data = pickle.load(f, encoding="latin1")

        ecg = np.asarray(data["signal"]["chest"]["ECG"]).reshape(-1)
        acc = np.asarray(data["signal"]["chest"]["ACC"])
        labels = np.asarray(data["label"]).reshape(-1)

        if acc.ndim != 2 or acc.shape[1] != 3:
            raise ValueError(f"Unexpected ACC shape for {subject_id}: {acc.shape}")

        rows.extend(window_subject_data(ecg, acc, labels, subject_id, fs, window_sec, step_sec))

    if not rows:
        raise ValueError("No usable windows extracted from WESAD dataset")
    return pd.DataFrame(rows)


def attach_baselines(df: pd.DataFrame, neutral_labels: list[int]) -> pd.DataFrame:
    out = df.copy()

    baseline_rows = out[out["label"].isin(neutral_labels)]
    neutral_group = baseline_rows.groupby("subject_id", as_index=False).agg(
        hr_baseline=("heart_rate", "mean"),
        rmssd_baseline=("hrv_rmssd", "mean"),
    )

    subject_group = out.groupby("subject_id", as_index=False).agg(
        hr_mean=("heart_rate", "mean"),
        rmssd_mean=("hrv_rmssd", "mean"),
    )

    merged = out.merge(neutral_group, on="subject_id", how="left").merge(subject_group, on="subject_id", how="left")
    merged["hr_baseline"] = merged["hr_baseline"].fillna(merged["hr_mean"])
    merged["rmssd_baseline"] = merged["rmssd_baseline"].fillna(merged["rmssd_mean"])

    merged = merged.drop(columns=["hr_mean", "rmssd_mean"])
    return merged


def attach_engagement_score(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out["HR_norm"] = (out["heart_rate"] - out["hr_baseline"]) / out["hr_baseline"]
    out["RMSSD_norm"] = out["hrv_rmssd"] / out["rmssd_baseline"]

    out["arousal"] = out["HR_norm"].apply(lambda x: scale_to_unit(float(x), lower=-0.2, upper=0.4))
    out["valence"] = out["RMSSD_norm"].apply(lambda x: scale_to_unit(float(x), lower=0.5, upper=1.5))
    out["engagement_score"] = (out["arousal"] * out["valence"]).clip(0.0, 1.0)
    return out


def make_training_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    required = [
        "heart_rate",
        "hrv_rmssd",
        "motion_level",
        "hr_baseline",
        "rmssd_baseline",
        "engagement_score",
    ]
    return df[required].copy()


def main() -> None:
    parser = argparse.ArgumentParser(description="Prepare WESAD for MindPulse training")
    parser.add_argument(
        "--dataset-root",
        default="",
        help="Path to extracted WESAD root. If omitted and --download is set, kagglehub download path is used.",
    )
    parser.add_argument("--download", action="store_true", help="Download WESAD from Kaggle via kagglehub")
    parser.add_argument("--output", default="data/wesad_mindpulse_train.csv", help="Output CSV path")
    parser.add_argument("--fs", type=int, default=DEFAULT_ECG_FS, help="Sampling rate for chest ECG")
    parser.add_argument("--window-sec", type=int, default=DEFAULT_WINDOW_SEC, help="Window size in seconds")
    parser.add_argument("--step-sec", type=int, default=DEFAULT_STEP_SEC, help="Sliding step in seconds")
    parser.add_argument(
        "--neutral-labels",
        type=int,
        nargs="+",
        default=DEFAULT_NEUTRAL_LABELS,
        help="Labels treated as rest/neutral for baseline estimation",
    )
    parser.add_argument(
        "--save-debug",
        action="store_true",
        help="Also save a debug CSV with subject_id/label/norm/arousal/valence columns",
    )
    args = parser.parse_args()

    if args.download:
        dataset_root = Path(kagglehub.dataset_download("mohamedasem318/wesad-full-dataset"))
    elif args.dataset_root:
        dataset_root = Path(args.dataset_root)
    else:
        raise ValueError("Provide --dataset-root or use --download")

    if not dataset_root.exists():
        raise FileNotFoundError(f"Dataset root does not exist: {dataset_root}")

    raw_df = load_wesad_subject_rows(dataset_root, fs=args.fs, window_sec=args.window_sec, step_sec=args.step_sec)
    with_baselines = attach_baselines(raw_df, neutral_labels=list(args.neutral_labels))
    scored = attach_engagement_score(with_baselines)
    final_df = make_training_dataframe(scored)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    final_df.to_csv(output_path, index=False)

    print(f"WESAD root: {dataset_root}")
    print(f"Samples extracted: {len(final_df)}")
    print(f"Saved training CSV: {output_path}")

    if args.save_debug:
        debug_cols = [
            "subject_id",
            "label",
            "heart_rate",
            "hrv_rmssd",
            "motion_level",
            "hr_baseline",
            "rmssd_baseline",
            "HR_norm",
            "RMSSD_norm",
            "arousal",
            "valence",
            "engagement_score",
        ]
        debug_path = output_path.with_name(output_path.stem + "_debug.csv")
        scored[debug_cols].to_csv(debug_path, index=False)
        print(f"Saved debug CSV: {debug_path}")


if __name__ == "__main__":
    main()
