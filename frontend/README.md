# MindPulse Frontend (React)

This frontend is the Parent/Teacher dashboard for MindPulse. The UI/UX layout remains unchanged while data flow is wired for real backend APIs.

## Stack

- React + Vite
- TailwindCSS
- Recharts
- Context API for auth, children, and sensor streams

## Backend API Integration

Frontend context layers are connected to these routes:

- `POST /auth/register`
- `POST /auth/login`
- `GET /children`
- `POST /children`
- `PUT /children/:id`
- `DELETE /children/:id`
- `POST /sensor-data`
- `GET /analytics?child_id=<id>&range=week`

Set backend base URL with Vite env var:

- `VITE_API_BASE_URL=http://localhost:5000`

If your Node/Express API is mounted under `/api`, set:

- `VITE_API_BASE_URL=http://localhost:5000/api`

## Run

```bash
npm install
npm run dev
```

Build:

```bash
npm run build
```

## Notes

- Existing page UI and component structure are preserved.
- Dashboard pages now read from backend-driven context data instead of fixed mock streams.
- If a backend endpoint is temporarily unavailable, contexts keep existing in-memory state and continue rendering.
