"""
Step 4 API test suite — Tests A through I.
Uses the reviewer_test account + a fresh child with a completed baseline.
"""
import json, sys, time, subprocess
import requests

BASE = "http://localhost:5001/api"
CHILD_ID = "6a04e831e97f25e109b22307"  # 'ats' — known-good baseline child

def pp(label, resp):
    try:
        body = json.dumps(resp.json(), indent=2)
    except Exception:
        body = resp.text[:500]
    sep = "=" * 60
    print(f"\n{sep}\n{label}\nHTTP {resp.status_code}\n{body}")
    return resp

# ── Auth ──────────────────────────────────────────────────────────────────────
r = requests.post(f"{BASE}/auth/login",
    json={"email": "reviewer_test@mindpulse.test", "password": "Test1234!"})
if r.status_code != 200:
    print("Login failed:", r.text); sys.exit(1)

token   = r.json()["token"]
auth    = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
print(f"[AUTH] OK — reviewer_test logged in")

# ── TEST A — Get categories (public endpoint) ─────────────────────────────────
pp("TEST A — GET /activity/categories (expected 200, 8 activities + groups)",
   requests.get(f"{BASE}/activity/categories"))

# ── Create a fresh child with valid baseline for remaining tests ──────────────
r = requests.post(f"{BASE}/children",
    json={"child_name": "TestStep4", "age": 9, "grade": "4"}, headers=auth)
child_id = r.json().get("_id") or r.json().get("id")
print(f"\n[SETUP] Created child: {child_id}")

# Inject a valid baseline directly via DB
inject = f"""
require('dotenv').config({{ path: './backend/.env' }});
const mongoose = require('./backend/node_modules/mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {{
  const Child = require('./backend/src/models/Child');
  await Child.updateOne(
    {{ _id: '{child_id}' }},
    {{ hr_baseline: 72, rmssd_baseline: 45, baseline_in_progress: false, baseline_started_at: null }}
  );
  console.log('Baseline injected');
  process.exit(0);
}}).catch(e => {{ console.error(e.message); process.exit(1); }});
"""
with open("_tmp_baseline.js", "w") as f: f.write(inject)
result = subprocess.run(["node", "_tmp_baseline.js"], capture_output=True, text=True)
print(result.stdout.strip())
import os; os.remove("_tmp_baseline.js")

# ── TEST B — Invalid activity ─────────────────────────────────────────────────
pp("TEST B — Start with invalid activity 'RandomActivity' (expected 400)",
   requests.post(f"{BASE}/activity/start",
       json={"child_id": child_id, "activity": "RandomActivity"}, headers=auth))

# ── TEST C — Valid activity: Math ─────────────────────────────────────────────
r_c = pp("TEST C — Start 'Math' session (expected 201, category: sedentary)",
    requests.post(f"{BASE}/activity/start",
        json={"child_id": child_id, "activity": "Math"}, headers=auth))
session_id = r_c.json().get("session_id", "")
print(f"  session_id: {session_id}")

# ── TEST D — Double-start guard ───────────────────────────────────────────────
pp("TEST D — Start 'Reading' while Math active (expected 409)",
   requests.post(f"{BASE}/activity/start",
       json={"child_id": child_id, "activity": "Reading"}, headers=auth))

# ── TEST E — Sensor data during session ──────────────────────────────────────
pp("TEST E — POST /sensor-data during Math session (expected 201 with activity_session_id)",
   requests.post(f"{BASE}/sensor-data",
       json={"child_id": child_id, "heart_rate": 80, "hrv_rmssd": 35,
             "motion_level": 0.1, "session_id": "boot-test-1"}, headers=auth))

# ── TEST F — High motion during sedentary (Math) ─────────────────────────────
r_f = pp("TEST F — High motion (5.0) during Math (sedentary) — expect LOW engagement",
    requests.post(f"{BASE}/sensor-data",
        json={"child_id": child_id, "heart_rate": 80, "hrv_rmssd": 35,
              "motion_level": 5.0, "session_id": "boot-test-1"}, headers=auth))
try:
    score_f = r_f.json()["engagement_result"]["engagement_score"]
    print(f"  → engagement_score (sedentary, motion=5): {score_f}")
except: pass

# ── TEST G — Finish session ───────────────────────────────────────────────────
pp("TEST G — POST /activity/finish (expected 200 with stats)",
   requests.post(f"{BASE}/activity/finish",
       json={"child_id": child_id}, headers=auth))

# ── TEST H — New session (history check) ─────────────────────────────────────
r_h = pp("TEST H — Start 'Sports' session (expected 201 — new doc, old Math preserved)",
    requests.post(f"{BASE}/activity/start",
        json={"child_id": child_id, "activity": "Sports"}, headers=auth))
session_id_sports = r_h.json().get("session_id", "")

# Verify old session still exists
verify = f"""
require('dotenv').config({{ path: './backend/.env' }});
const mongoose = require('./backend/node_modules/mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {{
  const ActivitySession = require('./backend/src/models/ActivitySession');
  const count = await ActivitySession.countDocuments({{ child_id: '{child_id}' }});
  const docs  = await ActivitySession.find({{ child_id: '{child_id}' }}).select('activity session_active').lean();
  console.log('Total sessions for child:', count);
  docs.forEach(d => console.log(' -', d.activity, '| active:', d.session_active));
  process.exit(0);
}}).catch(e => {{ console.error(e.message); process.exit(1); }});
"""
with open("_tmp_verify.js", "w") as f: f.write(verify)
result = subprocess.run(["node", "_tmp_verify.js"], capture_output=True, text=True)
print(f"\n[HISTORY CHECK]\n{result.stdout.strip()}")
os.remove("_tmp_verify.js")

# ── TEST I — High motion during Sports (active) ───────────────────────────────
r_i = pp("TEST I — High motion (5.0) during Sports (active) — expect HIGHER engagement than F",
    requests.post(f"{BASE}/sensor-data",
        json={"child_id": child_id, "heart_rate": 80, "hrv_rmssd": 35,
              "motion_level": 5.0, "session_id": "boot-test-2"}, headers=auth))
try:
    score_i = r_i.json()["engagement_result"]["engagement_score"]
    print(f"  → engagement_score (active, motion=5): {score_i}")
    print(f"\n  COMPARISON: sedentary={score_f}  active={score_i}  diff={round(score_i - score_f, 4)}")
    print(f"  Activity-aware formula: {'PASS ✅' if score_i > score_f else 'FAIL ❌'}")
except: pass

# ── Cleanup ───────────────────────────────────────────────────────────────────
requests.post(f"{BASE}/activity/finish", json={"child_id": child_id}, headers=auth)
requests.delete(f"{BASE}/children/{child_id}", headers=auth)
print(f"\n[CLEANUP] Finished Sports session + deleted child {child_id}")
