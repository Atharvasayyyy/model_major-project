"""Test I: Activity-aware scoring — verify Sports scores higher than Math on same motion=5 input."""
import requests, subprocess, json, os

BASE = 'http://localhost:5001/api'

r = requests.post(f'{BASE}/auth/login', json={'email': 'reviewer_test@mindpulse.test', 'password': 'Test1234!'})
token = r.json()['token']
auth = {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

# Get child_id of active Sports session
script = """
require('dotenv').config({path:'./backend/.env'});
const m=require('./backend/node_modules/mongoose');
m.connect(process.env.MONGO_URI).then(async()=>{
  const A=require('./backend/src/models/ActivitySession');
  const s=await A.findOne({session_active:true,activity:'Sports'});
  if(s) process.stdout.write(s.child_id+'|'+s._id);
  process.exit(0);
}).catch(e=>{process.stderr.write(e.message);process.exit(1);});
"""
with open('_tmp_test_i.js', 'w', encoding='utf-8') as f:
    f.write(script)
res = subprocess.run(['node', '_tmp_test_i.js'], capture_output=True, encoding='utf-8', errors='replace')
os.remove('_tmp_test_i.js')
output = res.stdout.strip()

if '|' not in output:
    print('No active Sports session found. Output:', output, res.stderr)
    exit(1)

child_id, session_id = output.split('|')
print(f'Active Sports session  child={child_id}  session={session_id}')

# TEST I — high motion during Sports (active category)
r_i = requests.post(f'{BASE}/sensor-data',
    json={'child_id': child_id.strip(), 'heart_rate': 80, 'hrv_rmssd': 35,
          'motion_level': 5.0, 'session_id': 'boot-sports-1'},
    headers=auth)

body = r_i.json()
er = body.get('engagement_result', {})
score_i = er.get('engagement_score', 'N/A')
print(f'\nTEST I — Sports (active), motion=5.0 => HTTP {r_i.status_code}')
print(f'  activity:          {er.get("activity")}')
print(f'  activity_session_id: {er.get("activity_session_id")}')
print(f'  arousal:           {er.get("arousal")}')
print(f'  valence:           {er.get("valence")}')
print(f'  engagement_score:  {score_i}')

score_f = 0.0039
print(f'\nCOMPARISON (same HR=80, HRV=35, motion=5, baseline=72/45):')
print(f'  Math    (sedentary): engagement_score = {score_f}')
print(f'  Sports  (active):    engagement_score = {score_i}')
if isinstance(score_i, float):
    diff = round(score_i - score_f, 4)
    print(f'  Improvement: +{diff}')
    result = 'PASS' if score_i > score_f else 'FAIL'
    print(f'  Activity-aware formula: {result}')
