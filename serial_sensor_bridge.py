"""MindPulse ESP32 serial bridge.

Reads JSON lines from ESP32 over serial and forwards transformed payloads
to the Node.js backend /api/sensor-data endpoint.

ESP32 sends camelCase JSON like:
  {"sessionId":"S001","timestamp":4296721,"heartRate":0,"hrvRmssd":1458476,
   "spo2":0,"motionLevel":10.05396,"restlessnessIndex":0.020502}

The bridge converts this to snake_case and applies gravity-removal to motionLevel:
  motion_level = abs(motionLevel - 9.8)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from typing import Any

import requests
import serial
from serial.tools import list_ports

DEFAULT_API_URL = "http://localhost:5001/api/sensor-data"
DEFAULT_BAUDRATE = 115200
DEFAULT_PORT = "auto"
# Common USB-to-serial chip descriptions for auto-detection
AUTO_PORT_KEYWORDS = ("cp210", "ch340", "usb", "uart", "silicon labs")

# Sensor validity thresholds — readings outside these ranges are skipped
HEART_RATE_MIN = 40
HEART_RATE_MAX = 200
HRV_RMSSD_MAX = 500   # ms; above this indicates no finger on sensor


def normalize_api_url(api_url: str) -> str:
    normalized = api_url.rstrip("/")
    if normalized.endswith("/api/sensor-data"):
        return normalized
    if normalized.endswith("/api"):
        return f"{normalized}/sensor-data"
    return f"{normalized}/api/sensor-data"


def get_health_url(api_url: str) -> str:
    normalized = api_url.rstrip("/")
    if normalized.endswith("/api/sensor-data"):
        return normalized.replace("/api/sensor-data", "/health")
    if normalized.endswith("/api"):
        return normalized.replace("/api", "/health")
    return f"{normalized}/health"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Forward ESP32 serial JSON to MindPulse backend")
    parser.add_argument("--child-id", help="Optional child_id override in backend")
    parser.add_argument("--port", default=DEFAULT_PORT, help="Serial port (default: auto, e.g. COM21)")
    parser.add_argument("--baud", type=int, default=DEFAULT_BAUDRATE, help=f"Baud rate (default: {DEFAULT_BAUDRATE})")
    parser.add_argument("--api-url", default=DEFAULT_API_URL, help=f"Backend endpoint (default: {DEFAULT_API_URL})")
    parser.add_argument("--timeout", type=float, default=1.0, help="Serial read timeout in seconds")
    return parser.parse_args()


def resolve_port(requested_port: str) -> str | None:
    if requested_port and requested_port.lower() != "auto":
        return requested_port

    ports = list(list_ports.comports())
    if not ports:
        return None

    def score(port_info: Any) -> int:
        haystack = f"{port_info.device} {port_info.description}".lower()
        return sum(1 for keyword in AUTO_PORT_KEYWORDS if keyword in haystack)

    ports.sort(key=score, reverse=True)
    return ports[0].device


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_valid_sensor_reading(heart_rate: Any, hrv_rmssd: Any) -> tuple[bool, str]:
    """
    Returns (is_valid, reason_string).
    heartRate=0 means no finger is on the MAX30100.
    hrvRmssd > 500 ms is physiologically impossible and also indicates no finger.
    """
    if not is_number(heart_rate) or heart_rate == 0:
        return False, f"heartRate={heart_rate} (no finger detected on MAX30100)"
    # Accept hrvRmssd = 0 (sensor warmup — only 1 beat detected so far, HRV needs 2+)
    # Only reject NEGATIVE values or values above the physiological maximum.
    if not is_number(hrv_rmssd) or hrv_rmssd < 0 or hrv_rmssd > HRV_RMSSD_MAX:
        return False, f"hrvRmssd={hrv_rmssd} (out of plausible range 0 to {HRV_RMSSD_MAX} ms)"
    if heart_rate < HEART_RATE_MIN or heart_rate > HEART_RATE_MAX:
        return False, f"heartRate={heart_rate} (out of valid range {HEART_RATE_MIN}-{HEART_RATE_MAX} bpm)"
    return True, ""


def transform_payload(raw: dict[str, Any], child_id: str | None = None) -> dict[str, Any] | None:
    """
    Read actual ESP32 camelCase fields and convert to snake_case for the backend.

    ESP32 sends:
      heartRate, hrvRmssd, motionLevel, spo2, sessionId, timestamp, restlessnessIndex

    motionLevel is ALREADY sqrt(ax²+ay²+az²) computed on the ESP32.
    We apply gravity-removal here: motion_level = abs(motionLevel - 9.8)
    """
    heart_rate    = raw.get("heartRate")
    hrv_rmssd     = raw.get("hrvRmssd")
    motion_level_raw = raw.get("motionLevel")
    spo2          = raw.get("spo2")
    restlessness  = raw.get("restlessnessIndex")
    session_id    = raw.get("sessionId")
    timestamp     = raw.get("timestamp")

    # All three core fields must be present and numeric
    if not all(is_number(v) for v in (heart_rate, hrv_rmssd, motion_level_raw)):
        return None

    # Gravity-removal: ESP32 motionLevel includes ~9.8 m/s² from gravity at rest
    motion_level = round(abs(float(motion_level_raw) - 9.8), 3)

    transformed: dict[str, Any] = {
        # Preserve 1 decimal place of precision for trend analysis.
        # The schema accepts Number so this is safe to store fractional bpm/ms.
        "heart_rate":   round(float(heart_rate), 1),
        "hrv_rmssd":    round(float(hrv_rmssd), 1),
        "motion_level": motion_level,
        "session_id":         str(session_id) if session_id is not None else None,
        "esp32_uptime_ms":    int(timestamp) if is_number(timestamp) else None,
        "restlessness_index": round(float(restlessness), 6) if is_number(restlessness) else None,
        "spo2":               int(round(float(spo2))) if is_number(spo2) and 70 <= int(round(float(spo2))) <= 100 else None,
    }

    if child_id:
        transformed["child_id"] = child_id

    # Strip None values — the backend accepts absence, not explicit null
    transformed = {k: v for k, v in transformed.items() if v is not None}

    return transformed


def open_serial(port: str, baud: int, timeout: float) -> serial.Serial:
    return serial.Serial(port=port, baudrate=baud, timeout=timeout)


def try_parse_serial_json(line: str, frame_buffer: str) -> tuple[dict[str, Any] | None, str]:
    """Parse both single-line and multi-line JSON objects from serial stream."""
    stripped = line.strip()
    if not stripped:
        return None, frame_buffer

    candidate = f"{frame_buffer}\n{stripped}" if frame_buffer else stripped

    open_braces  = candidate.count("{")
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

    api_url    = normalize_api_url(args.api_url)
    health_url = get_health_url(args.api_url)

    # ── Backend connectivity check ─────────────────────────────────────────
    print(f"[BRIDGE] Checking backend connectivity at {health_url} ...")
    try:
        health_resp = requests.get(health_url, timeout=5)
        if health_resp.status_code == 200:
            print("[BRIDGE] Backend is online and reachable.")
        else:
            print(f"[BRIDGE WARN] Backend returned non-200 status: {health_resp.status_code}")
    except requests.RequestException as exc:
        print(f"[BRIDGE ERROR] Could not connect to backend at {health_url}: {exc}")
        print("[BRIDGE] Please ensure your Node.js backend is running on port 5001.")
        print("[BRIDGE] Starting serial read loop anyway — will retry each packet...")

    if args.port.lower() == "auto":
        print("[BRIDGE] Listening on auto-detected serial port...")
    else:
        print(f"[BRIDGE] Listening on {args.port} @ {args.baud} baud")
    print(f"[BRIDGE] Forwarding sensor data to: {api_url}")
    print("[BRIDGE] Place finger firmly on MAX30100 sensor to get valid readings.")
    print("-" * 60)

    # ── Main serial loop ───────────────────────────────────────────────────
    while True:
        ser: serial.Serial | None = None
        try:
            resolved_port = resolve_port(args.port)
            if not resolved_port:
                print("[BRIDGE WARN] No serial device detected. Is the ESP32 plugged in? Retrying in 2s...")
                time.sleep(2)
                continue

            ser = open_serial(resolved_port, args.baud, args.timeout)
            print(f"[BRIDGE] Serial connected on {resolved_port} @ {args.baud} baud.")
            frame_buffer = ""

            while True:
                line = ser.readline().decode("utf-8", errors="ignore").strip()
                if not line:
                    continue

                print(f"[SERIAL] {line}")

                raw, frame_buffer = try_parse_serial_json(line, frame_buffer)
                if raw is None:
                    continue

                # ── Sensor validity diagnostic ─────────────────────────────
                heart_rate = raw.get("heartRate")
                hrv_rmssd  = raw.get("hrvRmssd")
                valid, reason = is_valid_sensor_reading(heart_rate, hrv_rmssd)
                if not valid:
                    print(f"[BRIDGE WARNING] Sensor reading invalid — {reason}")
                    print("[BRIDGE WARNING] Place finger firmly on MAX30100. Skipping this packet.")
                    continue

                # ── Build backend payload ──────────────────────────────────
                payload = transform_payload(raw, args.child_id)
                if payload is None:
                    print("[BRIDGE WARN] Packet missing heartRate / hrvRmssd / motionLevel — skipping.")
                    continue

                print(f"[BRIDGE] Sending payload: {json.dumps(payload)}")

                # ── POST with tiered retry ─────────────────────────────────────
                for attempt in range(1, 4):
                    try:
                        response = requests.post(
                            api_url,
                            json=payload,
                            headers={"Content-Type": "application/json"},
                            timeout=10,
                        )
                        status = response.status_code
                        if status in (200, 201, 202):
                            # Success — log and stop retrying
                            print(f"[BRIDGE] Backend accepted payload (HTTP {status})")
                            if response.text:
                                print(f"[BRIDGE] Response: {response.text}")
                            break
                        elif status == 408 or status == 429 or status >= 500:
                            # Transient failure — retry
                            delay = 2.0 if status == 429 else 1.0
                            label = {408: "timeout", 429: "rate-limited"}.get(status, f"server error {status}")
                            print(f"[BRIDGE ERROR] Backend returned HTTP {status} ({label}), attempt {attempt}/3")
                            if response.text:
                                print(f"[BRIDGE] Response: {response.text}")
                            if attempt < 3:
                                time.sleep(delay)
                        else:
                            # 4xx client error — payload is invalid; retrying won't help
                            print(f"[BRIDGE ERROR] Backend returned HTTP {status} (permanent client error — no retry)")
                            if response.text:
                                print(f"[BRIDGE] Response: {response.text}")
                            break
                    except requests.RequestException as exc:
                        print(f"[BRIDGE ERROR] POST failed (attempt {attempt}/3): {exc}")
                        if attempt < 3:
                            time.sleep(1)

        except serial.SerialException as exc:
            print(f"[BRIDGE ERROR] Serial connection failed: {exc}")
            if "access is denied" in str(exc).lower():
                print("[BRIDGE ERROR] COM port is locked by another process (e.g. Arduino Serial Monitor). Close it and retry.")
            print("[BRIDGE] Retrying in 2 seconds...")
            time.sleep(2)
        except KeyboardInterrupt:
            print("\n[BRIDGE] Stopped by user.")
            return 0
        finally:
            if ser is not None and ser.is_open:
                ser.close()


if __name__ == "__main__":
    sys.exit(main())
