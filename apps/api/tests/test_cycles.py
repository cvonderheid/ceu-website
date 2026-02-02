from fastapi.testclient import TestClient


def _create_state_license(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/state-licenses",
        json={"state_code": "WA", "license_number": "LIC"},
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
