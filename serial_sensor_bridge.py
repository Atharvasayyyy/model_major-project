"""MindPulse ESP32 serial bridge.

Reads JSON lines from ESP32 over serial and forwards transformed payloads
to the Node.js backend /api/sensor-data endpoint.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

import requests
import serial

DEFAULT_API_URL = "http://localhost:5000/api/sensor-data"
DEFAULT_BAUDRATE = 115200


def normalize_api_url(api_url: str) -> str:
    normalized = api_url.rstrip("/")
    if normalized.endswith("/api/sensor-data"):
        return normalized
    if normalized.endswith("/api"):
        return f"{normalized}/sensor-data"
    return f"{normalized}/api/sensor-data"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Forward ESP32 serial JSON to MindPulse backend")
    parser.add_argument("--child-id", required=True, help="Target child_id in backend")
    parser.add_argument("--port", default="COM3", help="Serial port (default: COM3)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUDRATE, help=f"Baud rate (default: {DEFAULT_BAUDRATE})")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Backend endpoint (default: {DEFAULT_API_URL})")
    parser.add_argument("--timeout", type=float, default=1.0, help="Serial read timeout in seconds")
    return parser.parse_args()


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def transform_payload(raw: dict[str, Any], child_id: str) -> dict[str, Any] | None:
    heart_rate = raw.get("heartRate")
    hrv_rmssd = raw.get("hrvRmssd")
    motion_level = raw.get("motionLevel")
    spo2 = raw.get("spo2")
    restlessness_index = raw.get("restlessnessIndex")

    if not all(is_number(v) for v in (heart_rate, hrv_rmssd, motion_level)):
        return None

    transformed = {
        "child_id": child_id,
        "heart_rate": int(round(float(heart_rate))),
        "hrv_rmssd": int(round(float(hrv_rmssd))),
        # Forward raw motion magnitude; backend middleware performs normalization.
        "motionLevel": round(float(motion_level), 3),
    }

    if is_number(spo2):
        transformed["spo2"] = int(round(float(spo2)))

    if is_number(restlessness_index):
        transformed["restlessness_index"] = round(float(restlessness_index), 3)

    return transformed


def open_serial(port: str, baud: int, timeout: float) -> serial.Serial:
    return serial.Serial(port=port, baudrate=baud, timeout=timeout)


def try_parse_serial_json(line: str, frame_buffer: str) -> tuple[dict[str, Any] | None, str]:
    """Parse both single-line and multi-line JSON objects from serial stream."""
    stripped = line.strip()
    if not stripped:
        return None, frame_buffer

    if frame_buffer:
        candidate = f"{frame_buffer}\n{stripped}"
    else:
        candidate = stripped

    open_braces = candidate.count("{")
    close_braces = candidate.count("}")

    if open_braces == 0:
        return None, ""

    if open_braces == close_braces:
        try:
            parsed = json.loads(candidate)
            return (parsed if isinstance(parsed, dict) else None), ""
        except json.JSONDecodeError:
            return None, ""

    return None, candidate


def main() -> int:
    args = parse_args()
    api_url = normalize_api_url(args.api_url)

    print(f"Listening to ESP32 serial on {args.port} @ {args.baud}...")
    print(f"Forwarding to backend: {api_url}")

    while True:
        ser: serial.Serial | None = None
        try:
            ser = open_serial(args.port, args.baud, args.timeout)
            print("Serial connected.")
            frame_buffer = ""

            while True:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                print(f"Raw Serial Line: {line}")

                raw, frame_buffer = try_parse_serial_json(line, frame_buffer)
                if raw is None:
                    continue

                payload = transform_payload(raw, args.child_id)
                if payload is None:
                    print("[WARN] Missing required fields (heartRate/hrvRmssd/motionLevel)")
                    continue

                print(f"Transformed Payload: {payload}")

                try:
                    response = requests.post(api_url, json=payload, timeout=10)
                    print(f"Backend Response Code: {response.status_code}")
                    if response.text:
                        print(f"Response Body: {response.text}")
                except requests.RequestException as exc:
                    print(f"[ERROR] Failed to send payload: {exc}")

        except serial.SerialException as exc:
            print(f"[ERROR] Serial connection failed: {exc}")
            print("Retrying in 3 seconds...")
            time.sleep(3)
        except KeyboardInterrupt:
            print("\nBridge stopped by user.")
            return 0
        finally:
            if ser is not None and ser.is_open:
                ser.close()


if __name__ == "__main__":
    sys.exit(main())
