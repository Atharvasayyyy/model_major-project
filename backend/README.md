# MindPulse Backend (Node.js + Express + MongoDB)

This backend receives physiological signals from ESP32 (through a Python serial bridge), enforces baseline-first calibration, computes engagement metrics, stores data in MongoDB, and serves analytics to the React dashboard.

## 1. End-to-End Architecture

ESP32 (MAX30100 + MPU6050) -> Serial JSON -> `serial_sensor_bridge.py` -> `POST /api/sensor-data` -> backend validation and normalization -> MongoDB (`sensor_data`, `engagement_results`, `alerts`) -> analytics APIs -> frontend polling.

## 2. What Was Implemented In Backend

### Sensor Processing Pipeline

- Route: `POST /api/sensor-data`

ESP32 produces serial JSON values such as:

- `heartRate`
- `hrvRmssd`
- `motionLevel`

Serial bridge/backend transformation to backend schema:

- `heartRate -> heart_rate`
- `hrvRmssd -> hrv_rmssd`
- `motionLevel -> motion_level`

Optional forwarded signals:

- `spo2`
- `restlessnessIndex -> restlessness_index`

### Motion normalization

`motionLevel` from accelerometer magnitude includes gravity.

Reference magnitude:

- `motionLevel = sqrt(ax^2 + ay^2 + az^2)`

Normalized backend value:

- `motion_level = abs(motionLevel - 9.8)`

This removes static gravity contribution and keeps dynamic motion signal.

### Payload validation

- `child_id` must be valid ObjectId
- `heart_rate` in `40..200`
- `hrv_rmssd` in `0..200`
- `motion_level` numeric
- optional `spo2` in `0..100`
- optional `restlessness_index` in `0..10`

### Baseline-first enforcement

Baseline is not entered manually during child registration.

Registration only creates child profile metadata. Baseline is computed later from live sensor readings.

- Baseline status endpoint:
  - `GET /api/baseline/status/:child_id`
- Baseline start/end endpoints:
  - `POST /api/baseline/start`
  - `POST /api/baseline/finish`
- Child model includes:
  - `baseline_in_progress`
- During baseline mode (`baseline_in_progress=true`):
  - incoming sensor readings are saved as baseline samples
  - baseline-tagged sensor rows are stored
  - engagement prediction is skipped

### Baseline calculation (5-minute still-state capture)

During baseline calibration, the user remains still for 5 minutes while sensor samples are collected.

Baselines are computed as:

- `hr_baseline = average(heart_rate samples)`
- `rmssd_baseline = average(hrv_rmssd samples)`

These values are stored in the child profile and used for normalization in engagement computation.

### Baseline flow summary

`child registration`

-> `baseline calibration (5-minute timer)`

-> `baseline stored`

-> `activity session monitoring enabled`

### Activity session control

- `POST /api/activity/start`
- `POST /api/activity/finish`
- `POST /api/activity/set` kept for compatibility
- Active session state stored in `ActivitySession` with:
  - `session_active`
  - `started_at`
  - `finished_at`

### Engagement and persistence

After baseline is ready and activity session is active:

- stores raw row in `sensor_data`
- computes `arousal`, `valence`, `engagement_score`
- stores processed row in `engagement_results`
- triggers alerts when thresholds are crossed

### Serial bridge transformation and logging

`serial_sensor_bridge.py` continuously:

1. reads JSON lines from ESP32 serial port
2. transforms field names to backend schema
3. posts payload to `POST /api/sensor-data`
4. prints logs such as:

- `Raw Serial: {...}`
- `Sending: {...}`
- `Response: 201`

### Sensor observability endpoints

- `GET /api/sensor-status/:child_id`
  - includes online/offline status based on recent data window
- `GET /api/debug/sensor-stream`
  - recent stream rows for debugging

### Analytics fallback safety

When baseline is not ready, analytics endpoints return safe empty payloads (not hard 400), for example:

- trend: `[]`
- realtime: `{ latest_sensor: null, latest_engagement: null, message: "No engagement data yet" }`

## 3. Data Models Used

### SensorData

Raw signal storage (architecture reference):

- `child_id`
- `activity`
- `heart_rate`
- `hrv_rmssd`
- `motion_level`
- `spo2` (optional)
- `restlessness_index` (optional)
- `timestamp`

### EngagementResult

Processed metrics storage (architecture reference):

- `child_id`
- `activity`
- `arousal`
- `valence`
- `engagement_score`
- `timestamp`

Implementation note:

- Current backend code may include additional context fields for compatibility (`activity_category`, and mirrored physiological fields).
- The architecture above defines canonical raw-vs-processed responsibility.

### BaselineSample

Stores baseline collection rows during calibration.

## 4. API Summary

Auth and child:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/children`
- `POST /api/children`
- `PUT /api/children/:id`
- `DELETE /api/children/:id`

Baseline and activity:

- `GET /api/baseline/status/:child_id`
- `POST /api/baseline/start`
- `POST /api/baseline/finish`
- `POST /api/activity/start`
- `POST /api/activity/finish`
- `POST /api/activity/set`

Sensor and analytics:

- `POST /api/sensor-data`
- `GET /api/sensor-status/:child_id`
- `GET /api/debug/sensor-stream`
- `GET /api/analytics/realtime/:child_id`
- `GET /api/analytics/engagement-trend/:child_id`
- `GET /api/analytics/activity-insights/:child_id`
- `GET /api/analytics/daily-summary/:child_id`
- `GET /api/alerts/:child_id`

## 5. Setup And Run

Create `backend/.env`:

```env
PORT=5000
MONGO_URI=<your_mongodb_uri>
JWT_SECRET=<your_secret>
```

Run backend:

```bash
npm install
npm start
```

Health check:

```bash
GET http://localhost:5000/health
```

## 6. How Frontend, Model, and ESP32 Are Connected

- ESP32 sends raw sensor lines over serial.
- `serial_sensor_bridge.py` parses and forwards to backend.
- Backend validates, normalizes, applies baseline-aware engagement logic, stores in MongoDB.
- Frontend polls analytics endpoints and renders live cards/charts.
- Baseline is mandatory before hobby monitoring and analytics.

## 7. Actual Errors Observed And Root Causes

### Browser extension async listener error

- Not backend code.
- Caused by Chrome extensions (React DevTools/Grammarly/AdBlock style message-channel issue).

### `ERR_CONNECTION_REFUSED` to `:5000`

- Backend process not running, port conflict, or DB connection failure.
- Common during startup/restart when an old process already owns port 5000.

### `400` on analytics during baseline

- Happens when engagement endpoints are called before baseline completion.
- Fixed with safe fallback responses + frontend baseline gating.

### Serial bridge issues

- No `Raw Serial` output: wrong COM port or ESP32 not streaming.
- `Access is denied` on COM port: another process has locked the port.

## 8. Practical Debug Checklist

1. `GET /health` returns `status: ok`.
2. Baseline status for child is checked.
3. If baseline running, sensor rows continue storing in baseline mode.
4. Activity session started before hobby sensor ingestion.
5. Realtime endpoint returns latest sensor + engagement rows.
6. Frontend cards/charts update via polling.
