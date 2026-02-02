from fastapi.testclient import TestClient


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
