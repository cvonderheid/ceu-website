from fastapi.testclient import TestClient


def _create_state_license(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/state-licenses",
        json={"state_code": "WA", "license_number": "LIC"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_course(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/courses",
        json={
            "title": "Course",
            "provider": "Provider",
            "completed_at": "2024-05-01",
            "hours": "5.0",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_cycle_requires_owned_state_license(client: TestClient) -> None:
    headers_user1 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    headers_user2 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-2"}

    state_license_id = _create_state_license(client, headers_user1)

    cycle_payload = {
        "state_license_id": state_license_id,
        "cycle_start": "2024-01-01",
        "cycle_end": "2024-12-31",
        "required_hours": "40.0",
    }
    resp = client.post("/api/cycles", json=cycle_payload, headers=headers_user2)
    assert resp.status_code == 404


def test_cycle_date_validation(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id = _create_state_license(client, headers)

    cycle_payload = {
        "state_license_id": state_license_id,
        "cycle_start": "2024-01-01",
        "cycle_end": "2024-01-01",
        "required_hours": "12.0",
    }
    resp = client.post("/api/cycles", json=cycle_payload, headers=headers)
    assert resp.status_code == 422


def test_delete_cycle_removes_allocations(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id = _create_state_license(client, headers)

    cycle_resp = client.post(
        "/api/cycles",
        json={
            "state_license_id": state_license_id,
            "cycle_start": "2024-01-01",
            "cycle_end": "2024-12-31",
            "required_hours": "40.0",
        },
        headers=headers,
    )
    assert cycle_resp.status_code == 201
    cycle_id = cycle_resp.json()["id"]

    course_id = _create_course(client, headers)

    allocations_before = client.get("/api/allocations", headers=headers)
    assert allocations_before.status_code == 200
    assert any(
        item["course_credit_id"] == course_id and item["license_cycle_id"] == cycle_id
        for item in allocations_before.json()
    )

    delete_resp = client.delete(f"/api/cycles/{cycle_id}", headers=headers)
    assert delete_resp.status_code == 204

    cycles_after = client.get("/api/cycles", headers=headers)
    assert cycles_after.status_code == 200
    assert all(item["id"] != cycle_id for item in cycles_after.json())

    allocations_after = client.get("/api/allocations", headers=headers)
    assert allocations_after.status_code == 200
    assert all(item["license_cycle_id"] != cycle_id for item in allocations_after.json())
