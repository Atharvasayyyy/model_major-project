# MindPulse Deployment Guide

MindPulse is split into three parts:

- `frontend/`: React + Vite dashboard deployed to Vercel free tier
- `backend/`: Node.js + Express API deployed to Render or Railway free tier
- `serial_sensor_bridge.py`: local Python bridge that stays on the ESP32 machine

## Free Hosting Plan

Use only free platform domains:

- Frontend: `https://mindpulse.vercel.app`
- Backend: `https://mindpulse-backend.onrender.com`
- Database: MongoDB Atlas free tier

## Deployment Flow

1. Deploy the backend from the `backend` folder to Render or Railway.
2. Set `MONGO_URI` and `JWT_SECRET` in the backend host.
3. Deploy the frontend from the `frontend` folder to Vercel.
4. Set `VITE_API_BASE_URL=https://<backend-domain>/api` in Vercel.
5. Run the serial bridge locally and point it at the deployed backend.

## Local Serial Bridge Command

Example command for a deployed backend:

```powershell
Set-Location "c:\Users\athar\OneDrive\Desktop\IOT\model iot"
& "c:\Users\athar\OneDrive\Desktop\IOT\model iot\.venv\Scripts\python.exe" serial_sensor_bridge.py --child-id <child_id> --port COM21 --api-url https://mindpulse-backend.onrender.com/api/sensor-data
```

The bridge also accepts these forms and normalizes them automatically:

- `https://mindpulse-backend.onrender.com`
- `https://mindpulse-backend.onrender.com/api`
- `https://mindpulse-backend.onrender.com/api/sensor-data`

## Production Architecture

ESP32
-> local Python serial bridge
-> `POST https://<backend-domain>/api/sensor-data`
-> Node backend
-> MongoDB Atlas
-> analytics APIs
-> React dashboard on Vercel

## Verification Checklist

1. Open `https://<backend-domain>/health` and confirm the response is `{ "status": "ok" }`.
2. Open the Vercel frontend domain and confirm login and dashboard pages load.
3. Start the serial bridge locally and confirm it receives `2xx` responses from the deployed backend.
4. Check MongoDB Atlas collections for new sensor records.
5. Confirm the dashboard shows current metrics from the hosted backend.

## Component Docs

- Backend deployment details: `backend/README.md`
- Frontend deployment details: `frontend/README.md`
- Python model service notes: `model/README.md`
