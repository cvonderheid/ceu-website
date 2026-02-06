from __future__ import annotations

import os
import uuid
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from fastapi import UploadFile

DEFAULT_CERT_STORAGE_DIR = Path(__file__).resolve().parents[2] / ".data" / "certificates"
DEFAULT_CERT_CONTENT_TYPE = "application/octet-stream"

_S3_CLIENT = None


def _get_cert_bucket() -> str | None:
    value = os.getenv("CERT_STORAGE_BUCKET")
    if not value:
        return None
    bucket = value.strip()
    return bucket or None


def _get_cert_prefix() -> str:
    prefix = os.getenv("CERT_STORAGE_PREFIX", "").strip().strip("/")
    return prefix


def _is_s3_enabled() -> bool:
    return _get_cert_bucket() is not None


def _get_s3_client():
    global _S3_CLIENT
    if _S3_CLIENT is None:
        _S3_CLIENT = boto3.client("s3")
    return _S3_CLIENT


def _make_object_key(filename: str | None) -> str:
    suffix = Path(filename or "").suffix
    name = f"{uuid.uuid4().hex}{suffix}"
    prefix = _get_cert_prefix()
    if prefix:
        return f"{prefix}/{name}"
    return name


def get_cert_storage_dir() -> Path:
    path_value = os.getenv("CERT_STORAGE_DIR")
    storage_dir = Path(path_value) if path_value else DEFAULT_CERT_STORAGE_DIR
    storage_dir.mkdir(parents=True, exist_ok=True)
    return storage_dir


def ensure_cert_storage_dir() -> Path:
    if _is_s3_enabled():
        return DEFAULT_CERT_STORAGE_DIR
    return get_cert_storage_dir()


def save_certificate_upload(file: UploadFile) -> tuple[str, int]:
    if _is_s3_enabled():
        bucket = _get_cert_bucket()
        if not bucket:
            raise RuntimeError("CERT_STORAGE_BUCKET is not configured")

        object_key = _make_object_key(file.filename)
        client = _get_s3_client()
        content_type = file.content_type or DEFAULT_CERT_CONTENT_TYPE
        file_obj = file.file
        file_obj.seek(0, os.SEEK_END)
        size_bytes = file_obj.tell()
        file_obj.seek(0)
        client.upload_fileobj(
            file_obj,
            bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )
        file_obj.close()
        return object_key, size_bytes

    storage_dir = get_cert_storage_dir()
    suffix = Path(file.filename or "").suffix
    filename = f"{uuid.uuid4().hex}{suffix}"
    destination = storage_dir / filename
    size_bytes = 0

    with destination.open("wb") as output:
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            size_bytes += len(chunk)
            output.write(chunk)
    file.file.close()
    return str(destination), size_bytes


def load_certificate_bytes(blob_path: str) -> bytes:
    if _is_s3_enabled():
        bucket = _get_cert_bucket()
        if not bucket:
            raise FileNotFoundError(blob_path)
        client = _get_s3_client()
        try:
            response = client.get_object(Bucket=bucket, Key=blob_path)
        except ClientError as error:
            code = error.response.get("Error", {}).get("Code")
            if code in {"NoSuchKey", "404"}:
                raise FileNotFoundError(blob_path) from error
            raise
        body = response["Body"]
        return body.read()

    path = Path(blob_path)
    if not path.exists():
        raise FileNotFoundError(blob_path)
    return path.read_bytes()


def delete_certificate_blob(blob_path: str) -> None:
    if _is_s3_enabled():
        bucket = _get_cert_bucket()
        if not bucket:
            return
        client = _get_s3_client()
        try:
            client.delete_object(Bucket=bucket, Key=blob_path)
        except ClientError:
            return
        return

    try:
        Path(blob_path).unlink(missing_ok=True)
    except OSError:
        pass
