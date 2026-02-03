from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_DATABASE_URL = "postgresql+psycopg://ce_user:ce_pass@localhost:5432/ce_tracker"
PORT = 8011
TIMEOUT_SECONDS = 20


def build_env() -> dict:
    env = os.environ.copy()
    env.setdefault("DATABASE_URL", DEFAULT_DATABASE_URL)
    env["DEV_USER_ID"] = "demo-user-1"
    env["DEV_EMAIL"] = "demo@example.com"
    return env


def apps_api_dir() -> Path:
    return Path(__file__).resolve().parents[3]


def wait_for_healthz(base_url: str) -> None:
    deadline = time.time() + TIMEOUT_SECONDS
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/healthz", timeout=3) as resp:
                if resp.status == 200:
                    return
        except Exception as exc:
            last_error = exc
        time.sleep(0.4)
    raise RuntimeError(f"Timed out waiting for /healthz: {last_error}")


def fetch_json(base_url: str, path: str):
    req = urllib.request.Request(f"{base_url}{path}")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.status, json.loads(resp.read().decode())


def download_bytes(base_url: str, path: str) -> bytes:
    req = urllib.request.Request(f"{base_url}{path}")
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.read()


def run_checks() -> None:
    base_url = f"http://127.0.0.1:{PORT}"

    status, me = fetch_json(base_url, "/api/me")
    if status != 200 or me.get("external_user_id") != "demo-user-1":
        raise RuntimeError(f"/api/me check failed: {status} {me}")

    status, progress = fetch_json(base_url, "/api/progress")
    if status != 200 or len(progress) != 4:
        raise RuntimeError(f"/api/progress expected 4 rows, got {status} {len(progress)}")

    warning_rows = [row for row in progress if row.get("warnings")]
    if len(warning_rows) != 2:
        raise RuntimeError(f"/api/progress expected 2 warning rows, got {len(warning_rows)}")

    status, courses = fetch_json(base_url, "/api/courses")
    if status != 200 or len(courses) != 4:
        raise RuntimeError(f"/api/courses expected 4 rows, got {status} {len(courses)}")

    cert_id = None
    for course in courses:
        course_id = course.get("id")
        if not course_id:
            continue
        cert_status, certs = fetch_json(base_url, f"/api/courses/{course_id}/certificates")
        if cert_status != 200:
            raise RuntimeError(f"/api/courses/{course_id}/certificates status {cert_status}")
        if certs:
            cert_id = certs[0].get("id")
            break

    if not cert_id:
        raise RuntimeError("No certificates found for any course")

    content = download_bytes(base_url, f"/api/certificates/{cert_id}/download")
    if not content:
        raise RuntimeError("Certificate download returned empty content")


def main() -> None:
    env = build_env()
    uvicorn_cmd = [
        "uv",
        "run",
        "uvicorn",
        "ce_api.main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(PORT),
        "--log-level",
        "warning",
    ]

    proc = subprocess.Popen(
        uvicorn_cmd,
        cwd=str(apps_api_dir()),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        wait_for_healthz(f"http://127.0.0.1:{PORT}")
        run_checks()
        print("demo_check_ok")
    finally:
        proc.send_signal(signal.SIGINT)
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"demo_check_failed: {exc}", file=sys.stderr)
        sys.exit(1)
