import os
from pathlib import Path

from fastapi.testclient import TestClient


def _create_course(client: TestClient, headers: dict) -> str:
    resp = client.post(
        "/api/courses",
        json={
            "title": "Cert Course",
            "provider": "Provider",
            "completed_at": "2024-02-01",
            "hours": "2.0",
        },
        headers=headers,
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def test_certificate_upload_download_delete(client: TestClient) -> None:
    headers = {"X-MS-CLIENT-PRINCIPAL-ID": "user-1"}
    course_id = _create_course(client, headers)

    file_content = b"hello certificate"
    files = {"file": ("cert.txt", file_content, "text/plain")}
    upload = client.post(f"/api/courses/{course_id}/certificates", files=files, headers=headers)
    assert upload.status_code == 201
    cert_id = upload.json()["id"]
    blob_path = upload.json()["blob_path"]

    assert Path(blob_path).exists()

    download = client.get(f"/api/certificates/{cert_id}/download", headers=headers)
    assert download.status_code == 200
    assert download.content == file_content

    delete = client.delete(f"/api/certificates/{cert_id}", headers=headers)
    assert delete.status_code == 204
    assert not Path(blob_path).exists()

    list_resp = client.get(f"/api/courses/{course_id}/certificates", headers=headers)
    assert list_resp.status_code == 200
    assert list_resp.json() == []
