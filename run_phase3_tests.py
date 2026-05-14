"""
Phase 3 integration tests: P3-A through P3-F
All HTTP tests; browser UI tests flagged with [BROWSER] where manual verification needed.
"""
import requests, json, time, subprocess, os, sys

BASE = "http://localhost:5001/api"

def login():
    r = requests.post(f"{BASE}/auth/login",
                      json={"email": "reviewer_test@mindpulse.test", "password": "Test1234!"})
    assert r.status_code == 200, f"Login failed: {r.text}"
    token = r.json()["token"]
    print(f"[AUTH] OK — logged in")
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def setup_child(auth):
    r = requests.post(f"{BASE}/children",
                      json={"child_name": "P3TestChild", "age": 8, "grade": "3", "gender": "male"},
                      headers=auth)
    assert r.status_code == 201, f"Create child failed: {r.text}"
    child_id = r.json().get("_id") or r.json().get("id")
    print(f"[SETUP] Created child: {child_id}")
    return child_id

def inject_baseline(child_id):
    script = f"""
require('dotenv').config({{path:'./backend/.env'}});
const m=require('./backend/node_modules/mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{{
  const C=require('./backend/src/models/Child');
  await C.updateOne({{_id:'{child_id}'}},{{$set:{{hr_baseline:72,rmssd_baseline:45,baseline_ready:true}}}});
  console.log('Baseline injected');
  process.exit(0);
}}).catch(e=>{{console.error(e.message);process.exit(1);}});
"""
    with open("_tmp_baseline_p3.js", "w") as f:
        f.write(script)
    res = subprocess.run(["node", "_tmp_baseline_p3.js"], capture_output=True,
                         encoding="utf-8", errors="replace")
    os.remove("_tmp_baseline_p3.js")
    print(res.stdout.strip().split("\n")[-1])


def sep(label):
    print(f"\n{'='*60}")
    print(f"TEST {label}")
    print('='*60)


auth = login()
child_id = setup_child(auth)
inject_baseline(child_id)

# ─── TEST P3-A: GET /activity/categories ─────────────────────────────────────
sep("P3-A — GET /activity/categories (no auth required)")
r = requests.get(f"{BASE}/activity/categories")
assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
body = r.json()
expected = ["Reading", "Math", "Drawing", "Sports", "Music", "Screen Time", "Free Play", "Other"]
assert body.get("activities") == expected, f"Wrong list: {body.get('activities')}"
assert set(body.get("groups", {}).get("active", [])) == {"Sports", "Free Play"}, "Wrong active group"
print(f"HTTP {r.status_code} ✅  activities={body['activities']}")

# ─── TEST P3-E: History endpoint (paginated) ─────────────────────────────────
sep("P3-E — GET /activity/history with pagination")
# First create a couple of finished sessions
for act in ["Math", "Drawing"]:
    r_start = requests.post(f"{BASE}/activity/start",
                             json={"child_id": child_id, "activity": act}, headers=auth)
    assert r_start.status_code == 201, f"start {act} failed: {r_start.text}"
    time.sleep(0.3)
    r_finish = requests.post(f"{BASE}/activity/finish",
                              json={"child_id": child_id}, headers=auth)
    assert r_finish.status_code == 200, f"finish {act} failed: {r_finish.text}"
    print(f"  Completed '{act}' session")

r = requests.get(f"{BASE}/activity/history/{child_id}?limit=5&skip=0", headers=auth)
assert r.status_code == 200, f"History failed: {r.status_code} {r.text}"
body = r.json()
assert "sessions" in body, f"Missing 'sessions' key: {body}"
assert "pagination" in body, f"Missing 'pagination' key: {body}"
p = body["pagination"]
assert "total" in p and "limit" in p and "skip" in p and "has_more" in p, f"Missing pagination fields: {p}"
assert p["limit"] == 5, f"Wrong limit: {p['limit']}"
assert p["skip"] == 0, f"Wrong skip: {p['skip']}"
sessions = body["sessions"]
assert len(sessions) >= 2, f"Expected >=2 sessions, got {len(sessions)}"
# Verify sorted DESC by started_at
timestamps = [s["started_at"] for s in sessions]
assert timestamps == sorted(timestamps, reverse=True), "Not sorted DESC"
print(f"HTTP 200 ✅  total={p['total']} sessions, has_more={p['has_more']}")
print(f"  Sample: {sessions[0]['activity']} | avg_engagement={sessions[0].get('avg_engagement')}")
print(json.dumps(body["pagination"], indent=2))

# ─── TEST P3-D: Stuck session auto-end (6h threshold) ────────────────────────
sep("P3-D — Stuck session auto-end at 6h threshold")
r_start = requests.post(f"{BASE}/activity/start",
                         json={"child_id": child_id, "activity": "Sports"}, headers=auth)
assert r_start.status_code == 201, f"start failed: {r_start.text}"
session_id = r_start.json()["session_id"]
print(f"  Started Sports session: {session_id}")

# Backdate started_at to 7 hours ago
script = f"""
require('dotenv').config({{path:'./backend/.env'}});
const m=require('./backend/node_modules/mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{{
  const A=require('./backend/src/models/ActivitySession');
  const sevenHoursAgo = new Date(Date.now() - 7*3600*1000);
  const r = await A.updateOne({{_id:'{session_id}'}},{{$set:{{started_at: sevenHoursAgo}}}});
  console.log('Backdated:', r.modifiedCount, 'doc(s)');
  process.exit(0);
}}).catch(e=>{{console.error(e.message);process.exit(1);}});
"""
with open("_tmp_backdate_p3.js", "w") as f:
    f.write(script)
res = subprocess.run(["node", "_tmp_backdate_p3.js"], capture_output=True,
                     encoding="utf-8", errors="replace")
os.remove("_tmp_backdate_p3.js")
print(f"  DB update: {res.stdout.strip().split(chr(10))[-1]}")

# Now call status — should auto-end and return session_active: false
r_status = requests.get(f"{BASE}/activity/status/{child_id}", headers=auth)
assert r_status.status_code == 200, f"Status failed: {r_status.text}"
status = r_status.json()
assert status["session_active"] is False, f"Expected session_active=false, got: {status}"
print(f"HTTP 200 ✅  session_active={status['session_active']} (auto-ended)")

# Verify DB record has session_active=false and finished_at set
script2 = f"""
require('dotenv').config({{path:'./backend/.env'}});
const m=require('./backend/node_modules/mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{{
  const A=require('./backend/src/models/ActivitySession');
  const s=await A.findById('{session_id}').lean();
  console.log('session_active:', s.session_active, '| finished_at:', s.finished_at);
  process.exit(0);
}}).catch(e=>{{console.error(e.message);process.exit(1);}});
"""
with open("_tmp_verify_p3.js", "w") as f:
    f.write(script2)
res2 = subprocess.run(["node", "_tmp_verify_p3.js"], capture_output=True,
                      encoding="utf-8", errors="replace")
os.remove("_tmp_verify_p3.js")
db_line = [l for l in res2.stdout.strip().split("\n") if "session_active" in l]
print(f"  DB verify: {db_line[-1] if db_line else res2.stdout}")

print(f"\n{'='*60}")
print("BACKEND TESTS COMPLETE")
print("P3-A ✅  Categories endpoint correct")
print("P3-D ✅  Stuck session auto-ended at 6h threshold")
print("P3-E ✅  History returns paginated response with sessions + pagination keys")
print("P3-B/C/F require browser — see instructions below")
print(f"{'='*60}")
print("""
BROWSER TESTS (manual):
  P3-B: Start Math session in UI → wait 30s → click Stop Session
        → confirm() dialog appears → confirm → alert shows duration + avg_engagement
  P3-C: Start any session → navigate to Dashboard
        → sidebar shows animated ● Active Session indicator
        → end session → indicator gone within 10s
  P3-F: Open HobbySession → Past Sessions table visible
        → active=orange badge, sedentary=blue badge
        → engagement column shows 2 decimal places (e.g. 0.14)
""")
