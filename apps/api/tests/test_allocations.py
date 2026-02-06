from fastapi.testclient import TestClient


def _create_state_license(client: TestClient, headers: dict, state_code: str = "WA") -> str:
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
            "required_hours": "10.0",
        },
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
            "completed_at": "2024-01-10",
            "hours": "5.0",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_bulk_allocations_ignore_duplicates(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id = _create_state_license(client, headers)
    cycle1 = _create_cycle(client, headers, state_license_id, "2024-01-01", "2024-06-30")
    cycle2 = _create_cycle(client, headers, state_license_id, "2024-07-01", "2024-12-31")
    course_id = _create_course(client, headers)

    payload = {"course_id": course_id, "cycle_ids": [cycle1, cycle2]}
    first = client.post("/api/allocations/bulk", json=payload, headers=headers)
    assert first.status_code == 201
    # Course creation auto-allocates into matching cycles by completion date.
    assert len(first.json()["created"]) == 1
    assert set(first.json()["skipped_cycle_ids"]) == {cycle1}

    second = client.post("/api/allocations/bulk", json=payload, headers=headers)
    assert second.status_code == 201
    assert second.json()["created"] == []
    assert set(second.json()["skipped_cycle_ids"]) == {cycle1, cycle2}


def test_allocation_requires_owned_cycle(client: TestClient) -> None:
    headers_user1 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    headers_user2 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-2"}
    state_license_id = _create_state_license(client, headers_user1)
    cycle_id = _create_cycle(client, headers_user1, state_license_id, "2024-01-01", "2024-12-31")
    course_id = _create_course(client, headers_user2)

    payload = {"course_id": course_id, "cycle_ids": [cycle_id]}
    resp = client.post("/api/allocations/bulk", json=payload, headers=headers_user2)
    assert resp.status_code == 404
