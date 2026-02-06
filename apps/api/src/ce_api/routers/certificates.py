from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import Certificate, CourseCredit, User
from ce_api.storage import delete_certificate_blob, load_certificate_bytes

router = APIRouter(prefix="/certificates", tags=["certificates"])


def _get_certificate_for_user(
    certificate_id: uuid.UUID,
    session: Session,
    current_user: User,
) -> Certificate | None:
    return session.scalar(
        select(Certificate)
        .join(CourseCredit, Certificate.course_credit_id == CourseCredit.id)
        .where(
            Certificate.id == certificate_id,
            CourseCredit.user_id == current_user.id,
        )
    )


@router.get("/{certificate_id}/download")
def download_certificate(
    certificate_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
):
    certificate = _get_certificate_for_user(certificate_id, session, current_user)
    if not certificate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    try:
        file_content = load_certificate_bytes(certificate.blob_path)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found")
    except Exception as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="File storage unavailable",
        ) from error

    safe_filename = certificate.filename.replace('"', "")
    return Response(
        content=file_content,
        media_type=certificate.content_type or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{safe_filename}"'},
    )


@router.delete("/{certificate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_certificate(
    certificate_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    certificate = _get_certificate_for_user(certificate_id, session, current_user)
    if not certificate:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    blob_path = certificate.blob_path
    session.delete(certificate)
    session.commit()

    delete_certificate_blob(blob_path)
