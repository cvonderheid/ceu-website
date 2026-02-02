from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import CreditAllocation, CourseCredit, LicenseCycle, StateLicense, User
from ce_api.schemas import AllocationBulkCreate, AllocationBulkResult, AllocationOut

router = APIRouter(prefix="/allocations", tags=["allocations"])


@router.post("/bulk", response_model=AllocationBulkResult, status_code=status.HTTP_201_CREATED)
def bulk_create_allocations(
    payload: AllocationBulkCreate,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> AllocationBulkResult:
    course = session.scalar(
        select(CourseCredit).where(
            CourseCredit.id == payload.course_id,
            CourseCredit.user_id == current_user.id,
        )
    )
    if not course:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    cycle_ids = list(dict.fromkeys(payload.cycle_ids))
    if not cycle_ids:
        return AllocationBulkResult(created=[], skipped_cycle_ids=[])

    cycles = session.scalars(
        select(LicenseCycle)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            StateLicense.user_id == current_user.id,
            LicenseCycle.id.in_(cycle_ids),
        )
    ).all()
    if len(cycles) != len(cycle_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    existing_cycle_ids = set(
        session.scalars(
            select(CreditAllocation.license_cycle_id).where(
                CreditAllocation.course_credit_id == course.id,
                CreditAllocation.license_cycle_id.in_(cycle_ids),
            )
        ).all()
    )

    created: List[AllocationOut] = []
    skipped: List[uuid.UUID] = []

    for cycle_id in cycle_ids:
        if cycle_id in existing_cycle_ids:
            skipped.append(cycle_id)
            continue
        allocation = CreditAllocation(course_credit_id=course.id, license_cycle_id=cycle_id)
        session.add(allocation)
        created.append(allocation)

    session.commit()

    created_out = [AllocationOut.model_validate(item) for item in created]
    return AllocationBulkResult(created=created_out, skipped_cycle_ids=skipped)


@router.get("", response_model=List[AllocationOut])
def list_allocations(
    course_id: Optional[uuid.UUID] = Query(default=None),
    cycle_id: Optional[uuid.UUID] = Query(default=None),
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> List[AllocationOut]:
    stmt = (
        select(CreditAllocation)
        .join(CourseCredit, CreditAllocation.course_credit_id == CourseCredit.id)
        .join(LicenseCycle, CreditAllocation.license_cycle_id == LicenseCycle.id)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            CourseCredit.user_id == current_user.id,
            StateLicense.user_id == current_user.id,
        )
    )
    if course_id:
        stmt = stmt.where(CreditAllocation.course_credit_id == course_id)
    if cycle_id:
        stmt = stmt.where(CreditAllocation.license_cycle_id == cycle_id)

    allocations = session.scalars(stmt).all()
    return [AllocationOut.model_validate(item) for item in allocations]


@router.delete("/{allocation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_allocation(
    allocation_id: uuid.UUID,
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
) -> None:
    allocation = session.scalar(
        select(CreditAllocation)
        .join(CourseCredit, CreditAllocation.course_credit_id == CourseCredit.id)
        .join(LicenseCycle, CreditAllocation.license_cycle_id == LicenseCycle.id)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            CreditAllocation.id == allocation_id,
            CourseCredit.user_id == current_user.id,
            StateLicense.user_id == current_user.id,
        )
    )
    if not allocation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    session.delete(allocation)
    session.commit()
