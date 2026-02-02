from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from ce_api.main import app
from ce_api.routers.progress import get_today


def _create_state_license(client: TestClient, headers: dict, state_code: str) -> str:
    resp = client.post(
        "/api/state-licenses",
        json={"state_code": state_code, "license_number": "LIC"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_cycle(client: TestClient, headers: dict, state_license_id: str, start: str, end: str) -> str:
    resp = client.post(
        "/api/cycles",
        json={
            "state_license_id": state_license_id,
            "cycle_start": start,
            "cycle_end": end,
            "required_hours": "40.0",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_course(client: TestClient, headers: dict, title: str, hours: str) -> str:
    resp = client.post(
        "/api/courses",
        json={
            "title": title,
            "provider": "Provider",
            "completed_at": "2024-02-01",
            "hours": hours,
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_progress_math_and_status(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id = _create_state_license(client, headers, "NY")
    cycle_id = _create_cycle(client, headers, state_license_id, "2024-01-01", "2024-12-31")
    course_id = _create_course(client, headers, "Course A", "10.0")

    alloc_payload = {"course_id": course_id, "cycle_ids": [cycle_id]}
    alloc_resp = client.post("/api/allocations/bulk", json=alloc_payload, headers=headers)
    assert alloc_resp.status_code == 201

    app.dependency_overrides[get_today] = lambda: date(2024, 6, 1)
    try:
        resp = client.get("/api/progress", headers=headers)
    finally:
        app.dependency_overrides.pop(get_today, None)

    assert resp.status_code == 200
    item = resp.json()[0]
    assert Decimal(item["earned_hours"]) == Decimal("10.0")
    assert Decimal(item["remaining_hours"]) == Decimal("30.0")
    assert Decimal(item["percent"]) == Decimal("0.25")
    assert item["status"] == "on_track"


def test_progress_warnings_same_state(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id = _create_state_license(client, headers, "CA")
    cycle1 = _create_cycle(client, headers, state_license_id, "2024-01-01", "2024-06-30")
    cycle2 = _create_cycle(client, headers, state_license_id, "2024-07-01", "2024-12-31")
    course_id = _create_course(client, headers, "Shared", "5.0")

    alloc_payload = {"course_id": course_id, "cycle_ids": [cycle1, cycle2]}
    alloc_resp = client.post("/api/allocations/bulk", json=alloc_payload, headers=headers)
    assert alloc_resp.status_code == 201

    app.dependency_overrides[get_today] = lambda: date(2024, 3, 1)
    try:
        resp = client.get("/api/progress", headers=headers)
    finally:
        app.dependency_overrides.pop(get_today, None)

    assert resp.status_code == 200
    items = resp.json()
    warnings = [item for item in items if item["warnings"]]
    assert len(warnings) == 2
    for item in warnings:
        warning = item["warnings"][0]
        assert warning["kind"] == "course_applied_to_multiple_cycles_in_state"
        assert warning["state_code"] == "CA"


def test_progress_warnings_different_states(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id_a = _create_state_license(client, headers, "OR")
    state_license_id_b = _create_state_license(client, headers, "NV")
    cycle1 = _create_cycle(client, headers, state_license_id_a, "2024-01-01", "2024-06-30")
    cycle2 = _create_cycle(client, headers, state_license_id_b, "2024-01-01", "2024-12-31")
    course_id = _create_course(client, headers, "Shared", "5.0")

    alloc_payload = {"course_id": course_id, "cycle_ids": [cycle1, cycle2]}
    alloc_resp = client.post("/api/allocations/bulk", json=alloc_payload, headers=headers)
    assert alloc_resp.status_code == 201

    app.dependency_overrides[get_today] = lambda: date(2024, 3, 1)
    try:
        resp = client.get("/api/progress", headers=headers)
    finally:
        app.dependency_overrides.pop(get_today, None)

    assert resp.status_code == 200
    items = resp.json()
    assert all(item["warnings"] == [] for item in items)
