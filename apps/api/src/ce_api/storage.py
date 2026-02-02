import os
from pathlib import Path

DEFAULT_CERT_STORAGE_DIR = Path(__file__).resolve().parents[2] / ".data" / "certificates"


def get_cert_storage_dir() -> Path:
    path_value = os.getenv("CERT_STORAGE_DIR")
    storage_dir = Path(path_value) if path_value else DEFAULT_CERT_STORAGE_DIR
    storage_dir.mkdir(parents=True, exist_ok=True)
    return storage_dir


def ensure_cert_storage_dir() -> Path:
    return get_cert_storage_dir()
