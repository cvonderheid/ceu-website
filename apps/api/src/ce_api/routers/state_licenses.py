from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import LicenseCycle, StateLicense, User
from ce_api.schemas import StateLicenseCreate, StateLicenseOut, StateLicenseUpdate

router = APIRouter(prefix="/state-licenses", tags=["state-licenses"])


@router.post("", response_model=StateLicenseOut, status_code=status.HTTP_201_CREATED)
def create_state_license(
    payload: StateLicenseCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> StateLicenseOut:
    state_license = StateLicense(
        user_id=current_user.id,
        state_code=payload.state_code,
        license_number=payload.license_number,
    )
    session.add(state_license)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="State license already exists for this user and state_code",
        ) from None

    session.refresh(state_license)
    return StateLicenseOut.model_validate(state_license)


@router.get("", response_model=List[StateLicenseOut])
def list_state_licenses(
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> List[StateLicenseOut]:
    stmt = (
        select(StateLicense)
        .where(StateLicense.user_id == current_user.id)
        .order_by(StateLicense.state_code.asc())
    )
    items = session.scalars(stmt).all()
    return [StateLicenseOut.model_validate(item) for item in items]


@router.get("/{state_license_id}", response_model=StateLicenseOut)
def get_state_license(
    state_license_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> StateLicenseOut:
    stmt = select(StateLicense).where(
        StateLicense.id == state_license_id,
        StateLicense.user_id == current_user.id,
    )
    state_license = session.scalar(stmt)
    if not state_license:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return StateLicenseOut.model_validate(state_license)


@router.patch("/{state_license_id}", response_model=StateLicenseOut)
def update_state_license(
    state_license_id: uuid.UUID,
    payload: StateLicenseUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> StateLicenseOut:
    stmt = select(StateLicense).where(
        StateLicense.id == state_license_id,
        StateLicense.user_id == current_user.id,
    )
    state_license = session.scalar(stmt)
    if not state_license:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if "license_number" in payload.model_fields_set:
        state_license.license_number = payload.license_number

    session.commit()
    session.refresh(state_license)
    return StateLicenseOut.model_validate(state_license)


@router.delete("/{state_license_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_state_license(
    state_license_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    stmt = select(StateLicense).where(
        StateLicense.id == state_license_id,
        StateLicense.user_id == current_user.id,
    )
    state_license = session.scalar(stmt)
    if not state_license:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    cycle_exists = session.scalar(
        select(LicenseCycle.id).where(LicenseCycle.state_license_id == state_license.id).limit(1)
    )
    if cycle_exists:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete state license with existing cycles",
        )

    session.delete(state_license)
    session.commit()
