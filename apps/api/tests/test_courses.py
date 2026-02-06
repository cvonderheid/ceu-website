from fastapi.testclient import TestClient


def _create_state_license(client: TestClient, headers: dict, state_code: str = "WA") -> str:
    resp = client.post(
        "/api/state-licenses",
        json={"state_code": state_code, "license_number": "LIC"},
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_cycle(
    client: TestClient, headers: dict, state_license_id: str, start: str, end: str
) -> str:
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


def test_course_crud_and_ownership(client: TestClient) -> None:
    headers_user1 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    headers_user2 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-2"}

    payload = {
        "title": "Ethics CE",
        "provider": "Provider A",
        "completed_at": "2024-02-01",
        "hours": "3.5",
    }

    create_resp = client.post("/api/courses", json=payload, headers=headers_user1)
    assert create_resp.status_code == 201
    course_id = create_resp.json()["id"]

    list_resp = client.get("/api/courses", headers=headers_user1)
    assert list_resp.status_code == 200
    assert len(list_resp.json()) == 1

    get_resp = client.get(f"/api/courses/{course_id}", headers=headers_user1)
    assert get_resp.status_code == 200

    get_other = client.get(f"/api/courses/{course_id}", headers=headers_user2)
    assert get_other.status_code == 404


def test_delete_course_removes_allocations(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    state_license_id = _create_state_license(client, headers)
    _create_cycle(client, headers, state_license_id, "2024-01-01", "2024-12-31")

    create_resp = client.post(
        "/api/courses",
        json={
            "title": "Deletion target",
            "provider": "Provider A",
            "completed_at": "2024-05-01",
            "hours": "2.0",
        },
        headers=headers,
    )
    assert create_resp.status_code == 201
    course_id = create_resp.json()["id"]

    allocations_before = client.get("/api/allocations", headers=headers)
    assert allocations_before.status_code == 200
    assert any(
        item["course_credit_id"] == course_id for item in allocations_before.json()
    )

    delete_resp = client.delete(f"/api/courses/{course_id}", headers=headers)
    assert delete_resp.status_code == 204

    allocations_after = client.get("/api/allocations", headers=headers)
    assert allocations_after.status_code == 200
    assert all(
        item["course_credit_id"] != course_id for item in allocations_after.json()
    )

    get_resp = client.get(f"/api/courses/{course_id}", headers=headers)
    assert get_resp.status_code == 404
