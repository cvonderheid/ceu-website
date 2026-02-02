from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date
from decimal import Decimal
from typing import Dict, List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import CreditAllocation, CourseCredit, LicenseCycle, StateLicense, User
from ce_api.schemas import ProgressOut, ProgressWarning

router = APIRouter(prefix="/progress", tags=["progress"])


def get_today() -> date:
    return date.today()


def _to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


@router.get("", response_model=List[ProgressOut])
def get_progress(
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
    today: date = Depends(get_today),
) -> List[ProgressOut]:
    cycles = session.execute(
        select(LicenseCycle, StateLicense.state_code)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(StateLicense.user_id == current_user.id)
        .order_by(LicenseCycle.cycle_end.asc())
    ).all()

    if not cycles:
        return []

    cycle_ids = [cycle.id for cycle, _state in cycles]

    allocation_rows = session.execute(
        select(
            CreditAllocation.license_cycle_id,
            CourseCredit.id.label("course_id"),
            CourseCredit.title,
            CourseCredit.hours,
            StateLicense.state_code,
        )
        .join(CourseCredit, CreditAllocation.course_credit_id == CourseCredit.id)
        .join(LicenseCycle, CreditAllocation.license_cycle_id == LicenseCycle.id)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(
            StateLicense.user_id == current_user.id,
            CreditAllocation.license_cycle_id.in_(cycle_ids),
        )
    ).all()

    earned_by_cycle: Dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    course_state_cycles: Dict[tuple[str, uuid.UUID], Dict[str, object]] = {}

    for row in allocation_rows:
        earned_by_cycle[row.license_cycle_id] += _to_decimal(row.hours)

        key = (row.state_code, row.course_id)
        if key not in course_state_cycles:
            course_state_cycles[key] = {
                "course_title": row.title,
                "cycle_ids": set(),
            }
        course_state_cycles[key]["cycle_ids"].add(row.license_cycle_id)

    warnings_by_cycle: Dict[uuid.UUID, List[ProgressWarning]] = defaultdict(list)
    for (state_code, course_id), info in course_state_cycles.items():
        cycle_ids = sorted(info["cycle_ids"])
        if len(cycle_ids) <= 1:
            continue
        warning = ProgressWarning(
            kind="course_applied_to_multiple_cycles_in_state",
            state_code=state_code,
            course_id=course_id,
            course_title=info["course_title"],
            cycle_ids=cycle_ids,
        )
        for cycle_id in cycle_ids:
            warnings_by_cycle[cycle_id].append(warning)

    results: List[ProgressOut] = []
    for cycle, state_code in cycles:
        required = _to_decimal(cycle.required_hours)
        earned = earned_by_cycle.get(cycle.id, Decimal("0"))
        remaining = required - earned
        if remaining < Decimal("0"):
            remaining = Decimal("0")

        if required == Decimal("0"):
            percent = Decimal("1")
        else:
            percent = earned / required
            if percent > Decimal("1"):
                percent = Decimal("1")

        days_remaining = (cycle.cycle_end - today).days
        if today > cycle.cycle_end:
            status = "overdue"
        elif percent == Decimal("1"):
            status = "complete"
        elif days_remaining <= 30:
            status = "at_risk"
        else:
            status = "on_track"

        results.append(
            ProgressOut(
                cycle_id=cycle.id,
                state_code=state_code,
                cycle_start=cycle.cycle_start,
                cycle_end=cycle.cycle_end,
                required_hours=required,
                earned_hours=earned,
                remaining_hours=remaining,
                percent=percent,
                days_remaining=days_remaining,
                status=status,
                warnings=warnings_by_cycle.get(cycle.id, []),
            )
        )

    return results
