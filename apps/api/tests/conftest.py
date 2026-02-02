import os
from pathlib import Path

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session, get_sessionmaker
from ce_api.main import app

TABLES = [
    "credit_allocations",
    "certificates",
    "course_credits",
    "license_cycles",
    "state_licenses",
    "users",
]


@pytest.fixture(scope="session", autouse=True)
def _require_database_url() -> None:
    if not os.getenv("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL must be set for tests")


@pytest.fixture(autouse=True)
def _cert_storage_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    storage_dir = tmp_path / "certs"
    storage_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("CERT_STORAGE_DIR", str(storage_dir))
    return storage_dir


@pytest.fixture()
def db_session() -> Session:
    session = get_sessionmaker()()
    session.execute(sa.text("TRUNCATE TABLE {} RESTART IDENTITY CASCADE".format(", ".join(TABLES))))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client(db_session: Session) -> TestClient:
    def override_db_session():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db_session] = override_db_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
