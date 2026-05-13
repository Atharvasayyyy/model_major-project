Project Name: MindPulse – AI-powered Student Engagement Monitoring System

Tech Stack Requirement:
Build the application using the **MERN stack**:

MongoDB → database
Express.js → backend API
React.js → frontend dashboard
Node.js → backend runtime

The application will connect to an IoT wearable device that sends physiological data. The system uses a machine learning model to estimate **child engagement level during different activities**.

---

Project Goal

Create a full-stack dashboard that allows parents and teachers to monitor a child's engagement and wellbeing using physiological signals such as heart rate and HRV collected from a wearable device.

The system should:
• receive real-time sensor data
• process engagement scores from the backend ML model
• display insights about activities and emotional engagement
• provide alerts when stress or low engagement is detected

---

Core System Architecture

Wearable Device (ESP32 + sensors)
↓
Node.js / Express Backend API
↓
Machine Learning Model (engagement prediction)
↓
MongoDB Database
↓
React Dashboard (Parent / Teacher Interface)

---

FEATURE 1 – User Authentication

Create a secure authentication system.

Pages Required:
• Register
• Login
• Logout

Users:
Parents or Teachers

Registration fields:
• name
• email
• password

Authentication:
• JWT-based authentication
• passwords stored with hashing

---

FEATURE 2 – Child Profile Management

Parents must be able to register a child profile.

Required fields:

child_name
age
grade
device_id

Example device_id:
MP-001

Each child profile should store:

• baseline heart rate
• baseline HRV values
• activity history
• engagement analytics

Database Example:

{
child_name: "Aryan",
age: 13,
device_id: "MP-001",
hr_baseline: 78,
rmssd_baseline: 52
}

Parents should be able to:

• add child
• edit child profile
• view child list

---

FEATURE 3 – Baseline Calibration

This feature initializes the physiological baseline required by the ML model.

When a new device is connected, the system must show a calibration screen.

UI Instruction:

"Please sit calmly and relax for 1 minute while the device records baseline data."

During calibration the backend collects:

heart_rate
hrv_rmssd
motion_level

Baseline calculation:

hr_baseline = average(heart_rate)

rmssd_baseline = average(hrv_rmssd)

Store these values in the child profile.

This baseline will later be used to normalize physiological signals.

---

FEATURE 4 – IoT Sensor Data API

Create a backend API endpoint that receives real-time sensor data from the wearable device.

POST /api/sensor-data

Example input:

{
"user_id": "U001",
"activity": "Football",
"heart_rate": 102,
"hrv_rmssd": 42,
"motion_level": 0.88,
"timestamp": "2026-03-06T10:35:00Z"
}

The backend should:

1. retrieve the user's baseline values
2. send data to the ML engagement model
3. store the prediction results
4. return the engagement score

---

FEATURE 5 – Engagement Prediction

The backend ML model outputs:

arousal
valence
engagement_score

Example response:

{
"engagement_score": 0.53,
"arousal": 0.84,
"valence": 0.30
}

Engagement score range:

0 – 0.2 → Stress
0.2 – 0.4 → Low Engagement
0.4 – 0.6 → Neutral
0.6 – 0.8 → Engaged
0.8 – 1 → Highly Engaged

Store prediction results in MongoDB.

---

FEATURE 6 – Real-Time Dashboard

Build a React dashboard where parents can monitor the child in real time.

Display cards showing:

Heart Rate
HRV (RMSSD)
Current Activity
Motion Level
Engagement Score

Visual components:

• Gauge chart for engagement score
• Line chart for heart rate over time
• Status indicator for emotional state

Example display:

Heart Rate: 102 bpm
Activity: Football
Engagement Score: 0.53
Status: Moderate Engagement

---

FEATURE 7 – Activity Insights

Show how different hobbies affect the child's engagement.

Display a chart:

Activity vs Average Engagement Score

Example table:

Football → 0.82
Drawing → 0.79
Reading → 0.64
Math Homework → 0.39

This helps parents understand which activities positively affect the child.

---

FEATURE 8 – Engagement Trends

Create a time-series visualization.

Graph:

Engagement Score vs Time

Allow filtering by:

• today
• week
• month

This helps track patterns in engagement.

---

FEATURE 9 – Alerts System

The system should notify parents when abnormal patterns are detected.

Alert triggers:

High stress detected
Engagement score below threshold
Heart rate significantly above baseline

Example alert message:

"High stress detected during Homework session."

Alerts should appear in:

• notification panel
• dashboard warnings

---

FEATURE 10 – Weekly Reports

Generate automated wellbeing reports.

Example output:

Weekly Engagement Report

Top Activities:
Football – 0.82
Drawing – 0.79

Low Engagement Activities:
Math Homework – 0.39

Display report using charts and summary cards.

---

Frontend Design Requirements

Use React with modern UI.

Suggested libraries:

• TailwindCSS for styling
• Recharts for graphs
• React Query for API calls

Design style:

Clean dashboard layout similar to modern health monitoring apps.

---

Backend Requirements

Node.js with Express.

Create API routes:

POST /auth/register
POST /auth/login
POST /children
GET /children
POST /sensor-data
GET /analytics

Use MongoDB collections:

users
children
sensor_data
engagement_results

---

Goal of the Product

Provide parents with clear insights into how different activities affect their child’s engagement and wellbeing using physiological data collected from wearable sensors.

The interface should be intuitive, informative, and suitable for real-time monitoring.
