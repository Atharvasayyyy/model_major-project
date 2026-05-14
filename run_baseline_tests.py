"""
Run all 5 baseline API tests sequentially against localhost:5001.
Uses a freshly registered test user + a new child profile.
Prints HTTP status + formatted JSON body for each.
"""
import json, sys, time, subprocess, os
import requests

BASE = "http://localhost:5001/api"

def pp(label, resp):
    try:
        body = json.dumps(resp.json(), indent=2)
    except Exception:
        body = resp.text
    print(f"\n{'='*60}")
    print(f"{label}")
    print(f"HTTP {resp.status_code}")
    print(body)

# ── Auth ──────────────────────────────────────────────────────
r = requests.post(f"{BASE}/auth/login", json={"email": "reviewer_test@mindpulse.test", "password": "Test1234!"})
if r.status_code != 200:
    print("Login failed:", r.text); sys.exit(1)

token   = r.json()["token"]
headers = {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}
print(f"[AUTH] Logged in OK — token obtained")

# ── Create a child profile ─────────────────────────────────────
r = requests.post(f"{BASE}/children", json={"child_name": "TestKid", "age": 8, "grade": "3"}, headers=headers)
child_id = r.json().get("_id") or r.json().get("id")
print(f"[SETUP] Created child: {child_id}")

# ── TEST A — Start calibration ────────────────────────────────
r = requests.post(f"{BASE}/baseline/start", json={"child_id": child_id}, headers=headers)
pp("TEST A — Start calibration (expected 200)", r)

# ── TEST B — Double-start guard ────────────────────────────────
r = requests.post(f"{BASE}/baseline/start", json={"child_id": child_id}, headers=headers)
pp("TEST B — Double-start (expected 409 Conflict)", r)

# ── TEST C — Cancel calibration ────────────────────────────────
r = requests.post(f"{BASE}/baseline/cancel", json={"child_id": child_id}, headers=headers)
pp("TEST C — Cancel (expected 200)", r)

# ── TEST D — Finish immediately after start (0 samples) ────────
requests.post(f"{BASE}/baseline/start", json={"child_id": child_id}, headers=headers)
r = requests.post(f"{BASE}/baseline/finish", json={"child_id": child_id}, headers=headers)
pp("TEST D — Finish with 0 samples (expected 200 with baseline_ready=false)", r)

# ── TEST E — Stuck calibration auto-recovery ───────────────────
print("\n[TEST E] Setting baseline_started_at to 10 minutes ago via direct DB update...")
script = f"""
require('dotenv').config({{ path: './backend/.env' }});
const mongoose = require('./backend/node_modules/mongoose');
mongoose.connect(process.env.MONGO_URI).then(async () => {{
  const Child = require('./backend/src/models/Child');
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const result = await Child.updateOne(
    {{ _id: '{child_id}' }},
    {{ baseline_in_progress: true, baseline_started_at: tenMinAgo }}
  );
  console.log('Matched:', result.matchedCount, 'Modified:', result.modifiedCount);
  process.exit(0);
}}).catch(e => {{ console.error(e.message); process.exit(1); }});
"""
with open("_tmp_stuck.js", "w") as f:
    f.write(script)
result = subprocess.run(["node", "_tmp_stuck.js"], capture_output=True, text=True, cwd=".")
print(result.stdout.strip() or result.stderr.strip())
os.remove("_tmp_stuck.js")
time.sleep(1)

r = requests.get(f"{BASE}/baseline/status/{child_id}", headers=headers)
pp("TEST E — Status after stuck flag (expected baseline_in_progress=false, auto-cancelled)", r)

# ── Cleanup: delete test child ─────────────────────────────────
requests.delete(f"{BASE}/children/{child_id}", headers=headers)
print(f"\n[CLEANUP] Deleted test child {child_id}")
