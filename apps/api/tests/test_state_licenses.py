from fastapi.testclient import TestClient


def test_create_and_list_state_licenses(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1", "X-MS-CLIENT-PRINCIPAL-NAME": "u1@example.com"}
    payload = {"state_code": "NY", "license_number": "ABC123"}

    create_resp = client.post("/api/state-licenses", json=payload, headers=headers)
    assert create_resp.status_code == 201

    list_resp = client.get("/api/state-licenses", headers=headers)
    assert list_resp.status_code == 200
    items = list_resp.json()
    assert len(items) == 1
    assert items[0]["state_code"] == "NY"


def test_state_license_ownership_404(client: TestClient) -> None:
    headers_user1 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    headers_user2 = {"X-MS-CLIENT-PRINCIPAL-ID": "user-2"}

    create_resp = client.post(
        "/api/state-licenses",
        json={"state_code": "CA", "license_number": "XYZ"},
        headers=headers_user1,
    )
    state_license_id = create_resp.json()["id"]

    get_resp = client.get(f"/api/state-licenses/{state_license_id}", headers=headers_user2)
    assert get_resp.status_code == 404


def test_state_license_unique_constraint_returns_409(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    payload = {"state_code": "TX", "license_number": "ONE"}

    first = client.post("/api/state-licenses", json=payload, headers=headers)
    assert first.status_code == 201

    second = client.post("/api/state-licenses", json=payload, headers=headers)
    assert second.status_code == 409


def test_state_license_normalizes_to_uppercase(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    create_resp = client.post(
        "/api/state-licenses",
        json={"state_code": "ny", "license_number": "lower"},
        headers=headers,
    )
    assert create_resp.status_code == 201
    assert create_resp.json()["state_code"] == "NY"

    duplicate = client.post(
        "/api/state-licenses",
        json={"state_code": "NY", "license_number": "upper"},
        headers=headers,
    )
    assert duplicate.status_code == 409


def test_state_license_rejects_non_alpha_state_code(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    create_resp = client.post(
        "/api/state-licenses",
        json={"state_code": "1A", "license_number": "bad"},
        headers=headers,
    )
    assert create_resp.status_code == 422
