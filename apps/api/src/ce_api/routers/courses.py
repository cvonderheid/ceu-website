from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import Certificate, CourseCredit, CreditAllocation, LicenseCycle, StateLicense, User
from ce_api.schemas import CertificateOut, CourseCreate, CourseOut, CourseUpdate
from ce_api.storage import delete_certificate_blob, save_certificate_upload

router = APIRouter(prefix="/courses", tags=["courses"])


def _validate_hours(hours: Decimal) -> None:
    if hours <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="hours must be greater than 0",
        )


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def create_course(
    payload: CourseCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> CourseOut:
    _validate_hours(payload.hours)

    course = CourseCredit(
        user_id=current_user.id,
        title=payload.title,
        provider=payload.provider,
        completed_at=payload.completed_at,
        hours=payload.hours,
    )
    session.add(course)
    session.flush()

    cycle_ids = session.scalars(
        select(LicenseCycle.id)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            StateLicense.user_id == current_user.id,
            LicenseCycle.cycle_start <= payload.completed_at,
            LicenseCycle.cycle_end >= payload.completed_at,
        )
    ).all()

    for cycle_id in cycle_ids:
        session.add(
            CreditAllocation(course_credit_id=course.id, license_cycle_id=cycle_id)
        )

    session.commit()
    session.refresh(course)
    return CourseOut.model_validate(course)


@router.get("", response_model=List[CourseOut])
def list_courses(
    from_date: Optional[date] = Query(default=None, alias="from"),
    to_date: Optional[date] = Query(default=None, alias="to"),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> List[CourseOut]:
    stmt = select(CourseCredit).where(CourseCredit.user_id == current_user.id)

    if from_date:
        stmt = stmt.where(CourseCredit.completed_at >= from_date)
    if to_date:
        stmt = stmt.where(CourseCredit.completed_at <= to_date)

    stmt = stmt.order_by(CourseCredit.completed_at.desc())
    courses = session.scalars(stmt).all()
    return [CourseOut.model_validate(course) for course in courses]


@router.get("/{course_id}", response_model=CourseOut)
def get_course(
    course_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> CourseOut:
    course = session.scalar(
        select(CourseCredit).where(
            CourseCredit.id == course_id,
            CourseCredit.user_id == current_user.id,
        )
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return CourseOut.model_validate(course)


@router.patch("/{course_id}", response_model=CourseOut)
def update_course(
    course_id: uuid.UUID,
    payload: CourseUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> CourseOut:
    course = session.scalar(
        select(CourseCredit).where(
            CourseCredit.id == course_id,
            CourseCredit.user_id == current_user.id,
        )
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if "title" in payload.model_fields_set:
        if payload.title is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="title cannot be null",
            )
        course.title = payload.title
    if "provider" in payload.model_fields_set:
        course.provider = payload.provider
    if "completed_at" in payload.model_fields_set:
        if payload.completed_at is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="completed_at cannot be null",
            )
        course.completed_at = payload.completed_at
    if "hours" in payload.model_fields_set:
        if payload.hours is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="hours cannot be null",
            )
        _validate_hours(payload.hours)
        course.hours = payload.hours

    session.commit()
    session.refresh(course)
    return CourseOut.model_validate(course)


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    course = session.scalar(
        select(CourseCredit).where(
            CourseCredit.id == course_id,
            CourseCredit.user_id == current_user.id,
        )
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    certificate_paths = session.scalars(
        select(Certificate.blob_path).where(Certificate.course_credit_id == course.id)
    ).all()

    session.execute(
        delete(CreditAllocation).where(CreditAllocation.course_credit_id == course.id)
    )
    session.execute(
        delete(Certificate).where(Certificate.course_credit_id == course.id)
    )

    session.delete(course)
    session.commit()

    for blob_path in certificate_paths:
        delete_certificate_blob(blob_path)


@router.post("/{course_id}/certificates", response_model=CertificateOut, status_code=status.HTTP_201_CREATED)
def upload_certificate(
    course_id: uuid.UUID,
    file: UploadFile = File(...),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> CertificateOut:
    course = session.scalar(
        select(CourseCredit).where(
            CourseCredit.id == course_id,
            CourseCredit.user_id == current_user.id,
        )
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    blob_path, size_bytes = save_certificate_upload(file)

    certificate = Certificate(
        course_credit_id=course.id,
        filename=file.filename or "certificate",
        content_type=file.content_type,
        size_bytes=size_bytes,
        blob_path=blob_path,
    )
    session.add(certificate)
    session.commit()
    session.refresh(certificate)
    return CertificateOut.model_validate(certificate)


@router.get("/{course_id}/certificates", response_model=List[CertificateOut])
def list_certificates(
    course_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> List[CertificateOut]:
    course = session.scalar(
        select(CourseCredit).where(
            CourseCredit.id == course_id,
            CourseCredit.user_id == current_user.id,
        )
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    certificates = session.scalars(
        select(Certificate).where(Certificate.course_credit_id == course.id)
    ).all()
    return [CertificateOut.model_validate(cert) for cert in certificates]
