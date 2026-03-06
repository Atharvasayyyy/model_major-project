"""MindPulse sensor data simulator.

Streams ESP32-like physiological payloads to the backend every N seconds.
Activity context is intentionally not sent from device payload and must be
set separately via dashboard (/api/activity/set).
"""

from __future__ import annotations

import argparse
import random
import time
from datetime import datetime, timezone

import requests

API_URL = "http://localhost:5000/api/sensor-data"
LOGIN_URL = "http://localhost:5000/api/auth/login"

# Device-side physiological ranges.
HEART_RATE_RANGE = (72, 130)
HRV_RMSSD_RANGE = (30, 70)
MOTION_LEVEL_RANGE = (0.02, 1.4)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Stream simulated sensor readings to MindPulse backend")
    parser.add_argument("--child-id", required=True, help="Target child_id in backend DB")
    parser.add_argument("--interval", type=float, default=2.0, help="Seconds between payloads (default: 2)")
    parser.add_argument("--api-url", default=API_URL, help=f"Sensor ingestion endpoint (default: {API_URL})")
    parser.add_argument(
        "--token",
        default="",
        help="Optional bearer token. If omitted, script can login using --email/--password.",
    )
    parser.add_argument("--email", default="", help="Parent email for optional login")
    parser.add_argument("--password", default="", help="Parent password for optional login")
    parser.add_argument(
        "--max-events",
        type=int,
        default=0,
        help="Stop after N events (0 = run forever)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=0,
        help="Optional random seed for reproducible streams (0 = random)",
    )
    return parser.parse_args()


def maybe_login_for_token(email: str, password: str) -> str:
    if not email or not password:
        return ""

    try:
        response = requests.post(LOGIN_URL, json={"email": email, "password": password}, timeout=10)
        if response.status_code != 200:
            print(f"[WARN] Login failed: {response.status_code} {response.text}")
            return ""

        token = response.json().get("token", "")
        if token:
            print("[INFO] Logged in successfully. Token acquired.")
        else:
            print("[WARN] Login response did not include token.")
        return token
    except requests.RequestException as exc:
        print(f"[WARN] Login request failed: {exc}")
        return ""


def generate_payload(child_id: str) -> dict[str, object]:
    heart_rate = random.randint(HEART_RATE_RANGE[0], HEART_RATE_RANGE[1])
    hrv_rmssd = random.randint(HRV_RMSSD_RANGE[0], HRV_RMSSD_RANGE[1])
    motion_level = round(random.uniform(MOTION_LEVEL_RANGE[0], MOTION_LEVEL_RANGE[1]), 3)

    return {
        "child_id": child_id,
        "heart_rate": heart_rate,
        "hrv_rmssd": hrv_rmssd,
        "motion_level": motion_level,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


def main() -> None:
    args = parse_args()

    if args.seed:
        random.seed(args.seed)

    token = args.token.strip()
    if not token:
        token = maybe_login_for_token(args.email.strip(), args.password)

    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    else:
        print("[INFO] No token provided. /api/sensor-data is expected to accept device traffic without JWT.")

    print("[INFO] Starting sensor simulator")
    print(f"[INFO] API URL: {args.api_url}")
    print(f"[INFO] Child ID: {args.child_id}")
    print(f"[INFO] Interval: {args.interval}s")

    event_count = 0
    while True:
        payload = generate_payload(args.child_id)
        event_count += 1

        try:
            response = requests.post(args.api_url, json=payload, headers=headers, timeout=10)
            print(f"\n[{event_count}] Sent payload: {payload}")
            print(f"[{event_count}] Response status: {response.status_code}")
            if response.text:
                print(f"[{event_count}] Response body: {response.text}")
        except requests.RequestException as exc:
            print(f"\n[{event_count}] Error sending payload: {exc}")

        if args.max_events > 0 and event_count >= args.max_events:
            print(f"[INFO] Reached max events ({args.max_events}). Stopping.")
            break

        time.sleep(args.interval)


if __name__ == "__main__":
    main()
