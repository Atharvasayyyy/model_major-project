# MindPulse Frontend (React + Vite)

This frontend is the parent/teacher dashboard for MindPulse. It is integrated with the Node.js backend and supports the full sensor workflow:

Child setup -> baseline calibration (mandatory) -> hobby activity session -> realtime analytics.

## 1. What Was Implemented

### Baseline-first gating

- When a child is selected, frontend checks `GET /api/baseline/status/:child_id`.
- Baseline gate uses both flags:
  - if `baseline_ready = false` and `baseline_in_progress = false`: show baseline start screen
  - if `baseline_in_progress = true`: show baseline timer screen and continue collection state
  - if `baseline_ready = true`: allow activity monitoring and analytics flow
- Analytics polling is disabled during baseline calibration.

### Baseline calibration screen (5-minute timer)

- Dedicated page: `Baseline Calibration`.
- UI includes:
  - countdown timer (`05:00 -> 00:00`)
  - progress bar
  - status text
  - heart-rate live preview
- Auto flow:
  - start: `POST /api/baseline/start`
  - before finish: verify minimum baseline samples
  - end: `POST /api/baseline/finish`
- Baseline completion guard:
  - minimum `200` baseline samples required before finish call

### Hobby monitoring screen (5-minute timer)

- Dedicated page: `Hobby Monitoring Session`.
- Activity selection supported:
  - Reading, Homework, Drawing, Football, Cycling, Gaming, Other
- Auto flow:
  - start: `POST /api/activity/start`
  - end at timer 0: `POST /api/activity/finish`
- Session persistence on reload:
  - frontend checks `GET /api/activity/status/:child_id`
  - if `session_active = true`, timer/session state is restored using `started_at`

### Sensor-ready timer protection

- Start buttons for baseline and hobby sessions are disabled until:
  - device status is online
  - valid physiological readings are available:
    - `heart_rate >= 40`
    - `hrv_rmssd > 0`
- If online but invalid readings: hint shows `"Place finger on sensor and wait for stable readings."`

### Analytics polling restrictions

- Frontend polling runs only when:
  - `baseline_ready = true`
  - `activity_session_active = true`
- Polling is disabled when baseline is in progress or no activity session is active.

### Realtime dashboard updates

- Polling uses `GET /api/analytics/realtime/:child_id`.
- Realtime response structure:

```json
{
  "latest_sensor": { "...": "..." },
  "latest_engagement": { "...": "..." }
}
```

- Trend/alert polling uses:
  - `GET /api/analytics/engagement-trend/:child_id`
  - `GET /api/alerts/:child_id`
- Live metrics displayed include:
  - Heart Rate
  - HRV (RMSSD)
  - Motion Level
  - SpO2
  - Engagement score

### Sensor data vs analytics data

- Frontend dashboards consume processed analytics payloads, not direct raw ESP32 lines.
- System flow:

`ESP32 -> sensor_data collection -> engagement_results -> analytics APIs -> frontend dashboard`

### Metric source mapping

- Heart Rate -> `sensor_data`
- HRV RMSSD -> `sensor_data`
- Motion Level -> `sensor_data`
- SpO2 -> `sensor_data`
- Engagement Score -> `engagement_results`

### Activity category mapping

- Reading -> `cognitive_indoor`
- Homework -> `cognitive_indoor`
- Drawing -> `creative_indoor`
- Football -> `outdoor_sport`
- Cycling -> `outdoor_sport`
- Gaming -> `digital_activity`

## 2. API Contract Used By Frontend

Auth/child:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/children`
- `POST /api/children`
- `PUT /api/children/:id`
- `DELETE /api/children/:id`

Baseline/session:

- `GET /api/baseline/status/:child_id`
- `POST /api/baseline/start`
- `POST /api/baseline/finish`
- `GET /api/sensor-status/:child_id`
- `POST /api/activity/start`
- `POST /api/activity/finish`
- `GET /api/activity/status/:child_id`

Analytics/alerts:

- `GET /api/analytics/realtime/:child_id`
- `GET /api/analytics/engagement-trend/:child_id`
- `GET /api/analytics/activity-insights/:child_id`
- `GET /api/analytics/daily-summary/:child_id`
- `GET /api/alerts/:child_id`

## 3. Setup And Run

Create `.env` in `frontend/`:

```env
VITE_API_BASE_URL=http://localhost:5000/api
```

Run:

```bash
npm install
npm run dev
```

Build check:

```bash
npm run build
```

## 4. Deploy On Vercel Free Tier

MindPulse frontend is ready for Vercel deployment with a free Vercel domain and an environment-based backend URL.

### Required environment variable

Set this in the Vercel project settings:

```env
VITE_API_BASE_URL=https://<backend-domain>/api
```

Example:

```env
VITE_API_BASE_URL=https://mindpulse-backend.onrender.com/api
```

### Vercel settings

- Framework preset: `Vite`
- Root directory: `frontend`
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: `dist`

### Deploy steps

1. Deploy the backend first on Render or Railway and copy its free domain.
2. Push the repository to GitHub.
3. In Vercel, import the same repository.
4. Set the root directory to `frontend`.
5. Add `VITE_API_BASE_URL=https://<backend-domain>/api`.
6. Deploy and open the Vercel domain, for example `https://mindpulse.vercel.app`.

### Production behavior

- The frontend reads `import.meta.env.VITE_API_BASE_URL` at build time.
- All API requests use that value instead of a hardcoded localhost URL.
- Direct navigation to app routes is handled by the Vercel rewrite config in `frontend/vercel.json`.

## 5. How Frontend Is Attached To ESP32 + Backend + Model

Frontend never reads ESP32 directly. The attachment path is:

ESP32 -> Python serial bridge -> Node backend `/api/sensor-data` -> `sensor_data` + `engagement_results` -> analytics API -> frontend polling UI.

The model logic is applied inside backend ingestion/analytics flow (baseline-normalized engagement).

## 6. Real Errors Encountered And Actual Causes

### "A listener indicated an asynchronous response..."

- Source: browser extension messaging (not project code).
- Impact: none on app logic.

### `ERR_CONNECTION_REFUSED` to `:5000`

- Source: backend process not running / port conflict / DB disconnect.
- Fix: ensure backend is running and DB is connected.

### `400` on analytics during baseline

- Source: analytics called before baseline completion.
- Fix implemented:
  - frontend skips analytics polling when baseline not ready
  - backend returns safe empty responses instead of hard 400 for no-data scenarios

### Serial port access denied

- Source: COM port locked by another process (Serial Monitor, another bridge instance).
- Fix: close conflicting process and rerun bridge on correct COM port.

## 7. Expected Runtime Behavior

1. User adds/selects child.
2. App checks baseline status.
3. If baseline missing -> baseline screen shown and monitoring blocked.
4. After baseline completes -> user can start hobby session.
5. During session, dashboard updates with live sensor + engagement data.
6. Alerts/trends/insights become available through analytics APIs.

## 8. Deployment Verification Checklist

After both services are deployed:

1. Open `https://<backend-domain>/health` and confirm it returns `{ "status": "ok" }`.
2. Open the Vercel domain and confirm the dashboard loads.
3. Start the local serial bridge with the deployed backend URL.
4. Confirm MongoDB Atlas receives new `sensor_data` records.
5. Confirm live metrics update in the hosted dashboard.
