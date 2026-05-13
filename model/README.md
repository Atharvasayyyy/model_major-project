# MindPulse Model Service (Python)

This folder contains the standalone Python model service and training code for MindPulse.

In the current integrated app, the Node.js backend computes engagement using the same baseline-normalized logic (deterministic service wrapper), while this Python project remains the model/training reference and optional serving endpoint.

## 1. Purpose

Predict engagement score (`0..1`) from physiological signals with baseline normalization.

Inputs:

- `heart_rate`
- `hrv_rmssd`
- `motion_level`
- `hr_baseline`
- `rmssd_baseline`

Optional context fields in full system:

- `activity_category`
- `spo2`
- `restlessness_index`

Outputs:

- `arousal`
- `valence`
- `engagement_score`

## 2. Baseline Logic (Core)

Every child requires personal baseline values before analytics.

Equations used by the system:

- `HR_norm = (heart_rate - hr_baseline) / hr_baseline`
- `RMSSD_norm = (hrv_rmssd - rmssd_baseline) / rmssd_baseline`
- `arousal = sigmoid(HR_norm - RMSSD_norm)`
- `valence = sigmoid(-motion_level)`
- `engagement_score = clip(arousal * valence, 0, 1)`

`engagement_score` represents physiological engagement in the range `0..1`.

Motion normalization used by backend ingestion:

- `motionLevel = sqrt(ax^2 + ay^2 + az^2)`
- `motion_level = abs(motionLevel - 9.8)`

HRV definition used by ESP32 firmware:

- `RMSSD = sqrt(mean((RR_i - RR_(i-1))^2))`

RR intervals are derived from heartbeat detection.

Signal validation rules:

- `heart_rate` must be between `40` and `200`
- `hrv_rmssd` must be `> 0`
- `motion_level` must be numeric

Invalid sensor readings are ignored and should not be used for scoring.

Why baseline matters:

- two children can have very different resting HR/HRV
- without baseline normalization, stress/engagement can be misclassified

## 3. Files

- `app.py`: FastAPI server (`/health`, `/predict`)
- `src/mindpulse/model.py`: inference wrapper and baseline lookup
- `src/mindpulse/engagement.py`: valence-arousal calculations
- `src/mindpulse/train.py`: model training pipeline
- `src/mindpulse/prepare_wesad.py`: prepare training CSV
- `config/baselines.json`: baseline data
- `models/mindpulse_rf.joblib`: trained model artifact

`mindpulse_rf.joblib` is experimental.

Current runtime backend inference uses deterministic physiological equations.

The Python model service is used for training experiments and potential future ML deployment.

## 4. Setup

```bash
pip install -r requirements.txt
```

Run API:

```bash
uvicorn app:app --reload
```

Run API (Windows + project `.venv`):

```powershell
Set-Location "c:\Users\athar\OneDrive\Desktop\IOT\model iot\model"
& "c:\Users\athar\OneDrive\Desktop\IOT\model iot\.venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

Optional experimental RF mode:

```bash
MINDPULSE_ENABLE_EXPERIMENTAL_RF=true uvicorn app:app --reload
```

## 5. Training

Train from existing CSV:

```bash
python -m src.mindpulse.train --data data/wesad_mindpulse_train.csv --model-out models/mindpulse_rf.joblib
```

Prepare WESAD dataset CSV:

```bash
python -m src.mindpulse.prepare_wesad --download --output data/wesad_mindpulse_train.csv --save-debug
```

## 6. Integration With Node + Frontend + ESP32

Current runtime architecture used in this repository:

**ESP32 -> Python serial bridge -> Node `/api/sensor-data` -> MongoDB -> analytics API -> React dashboard**

### File Structure & Key Components:
- **`backend/`**: Node.js/Express server providing the core API and data storage.
  - `server.js`: Main entry point for the backend API.
  - `src/controllers/sensorDataController.js`: Handles incoming data, automatically routing it to the most recent child profile.
- **`frontend/`**: React application dashboard for visualizing real-time metrics.
- **`serial_sensor_bridge.py`**: Python script that reads from the ESP32 via COM port and POSTs to the backend.

### Setup & Usage Workflow:
1. **Start the Backend:** Run `node server.js` (or `npm run dev`) inside the `backend/` directory on port 5001.
2. **Start the Frontend:** Run `npm run dev` inside the `frontend/` directory.
3. **Create a Child Profile:** Using the frontend dashboard, log in and add a new Child. **IMPORTANT:** The sensor routing is device-agnostic, meaning the backend will automatically assign incoming sensor data to the most recently active or created child. **No device ID is needed.**
4. **Start the Sensor Bridge:** Connect the ESP32 and run:
   ```bash
   python -u serial_sensor_bridge.py
   ```
   *(Note: The bridge will auto-detect the COM port and no longer requires a `--device-id` argument)*

Model equations are applied in Node backend service layer (`calculateEngagement`) with baseline-normalized metrics.

Inference pipeline:

sensor reading -> validation -> baseline normalization -> arousal calculation -> valence calculation -> engagement score

The Python model service can still be used as a separate inference endpoint or for retraining/export workflows.

## 7. Known Runtime Error Sources (Observed)

- Browser extension async listener warning: not model code.
- Backend `ERR_CONNECTION_REFUSED`: backend process down or DB connectivity issue.
- Analytics pre-baseline errors: caused by requesting engagement data before baseline is ready.
- Serial COM access denied: COM port locked by another process.



```powershell
Set-Location "c:\Users\athar\OneDrive\Desktop\IOT\model iot\model"
& "c:\Users\athar\OneDrive\Desktop\IOT\model iot\.venv\Scripts\python.exe" -m uvicorn app:app --host 127.0.0.1 --port 8000 --reload
```

