from __future__ import annotations

import uuid
from decimal import Decimal
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import LicenseCycle, StateLicense, User
from ce_api.schemas import LicenseCycleCreate, LicenseCycleOut, LicenseCycleUpdate

router = APIRouter(prefix="/cycles", tags=["cycles"])


def _validate_cycle_dates(start, end) -> None:
    if end <= start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="cycle_end must be after cycle_start",
        )


def _validate_required_hours(required_hours: Decimal) -> None:
    if required_hours <= Decimal("0"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="required_hours must be greater than 0",
        )


@router.post("", response_model=LicenseCycleOut, status_code=status.HTTP_201_CREATED)
def create_cycle(
    payload: LicenseCycleCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> LicenseCycleOut:
    state_license = session.scalar(
        select(StateLicense).where(
            StateLicense.id == payload.state_license_id,
            StateLicense.user_id == current_user.id,
        )
    )
    if not state_license:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    _validate_cycle_dates(payload.cycle_start, payload.cycle_end)
    _validate_required_hours(payload.required_hours)

    cycle = LicenseCycle(
        state_license_id=payload.state_license_id,
        cycle_start=payload.cycle_start,
        cycle_end=payload.cycle_end,
        required_hours=payload.required_hours,
    )
    session.add(cycle)
    session.commit()
    session.refresh(cycle)
    return LicenseCycleOut.model_validate(cycle)


@router.get("", response_model=List[LicenseCycleOut])
def list_cycles(
    state_license_id: Optional[uuid.UUID] = Query(default=None),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> List[LicenseCycleOut]:
    stmt = (
        select(LicenseCycle)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(StateLicense.user_id == current_user.id)
        .order_by(LicenseCycle.cycle_end.asc())
    )
    if state_license_id:
        stmt = stmt.where(LicenseCycle.state_license_id == state_license_id)

    cycles = session.scalars(stmt).all()
    return [LicenseCycleOut.model_validate(cycle) for cycle in cycles]


@router.get("/{cycle_id}", response_model=LicenseCycleOut)
def get_cycle(
    cycle_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> LicenseCycleOut:
    stmt = (
        select(LicenseCycle)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            LicenseCycle.id == cycle_id,
            StateLicense.user_id == current_user.id,
        )
    )
    cycle = session.scalar(stmt)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return LicenseCycleOut.model_validate(cycle)


@router.patch("/{cycle_id}", response_model=LicenseCycleOut)
def update_cycle(
    cycle_id: uuid.UUID,
    payload: LicenseCycleUpdate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> LicenseCycleOut:
    stmt = (
        select(LicenseCycle)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            LicenseCycle.id == cycle_id,
            StateLicense.user_id == current_user.id,
        )
    )
    cycle = session.scalar(stmt)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if "cycle_start" in payload.model_fields_set:
        if payload.cycle_start is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="cycle_start cannot be null",
            )
        cycle.cycle_start = payload.cycle_start
    if "cycle_end" in payload.model_fields_set:
        if payload.cycle_end is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="cycle_end cannot be null",
            )
        cycle.cycle_end = payload.cycle_end
    if "required_hours" in payload.model_fields_set:
        if payload.required_hours is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="required_hours cannot be null",
            )
        cycle.required_hours = payload.required_hours

    _validate_cycle_dates(cycle.cycle_start, cycle.cycle_end)
    _validate_required_hours(cycle.required_hours)

    session.commit()
    session.refresh(cycle)
    return LicenseCycleOut.model_validate(cycle)


@router.delete("/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cycle(
    cycle_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    stmt = (
        select(LicenseCycle)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            LicenseCycle.id == cycle_id,
            StateLicense.user_id == current_user.id,
        )
    )
    cycle = session.scalar(stmt)
    if not cycle:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    session.delete(cycle)
    session.commit()
