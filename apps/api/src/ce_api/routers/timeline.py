from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ce_api.db.session import get_db_session
from ce_api.deps import get_current_user
from ce_api.models import Certificate, CreditAllocation, CourseCredit, LicenseCycle, StateLicense, User
from ce_api.schemas import (
    ProgressWarning,
    TimelineCertificate,
    TimelineCourse,
    TimelineCycle,
    TimelineEvent,
    TimelineResponse,
    TimelineState,
)

router = APIRouter(prefix="/timeline", tags=["timeline"])


def get_today() -> date:
    return date.today()


def _to_decimal(value) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _in_range(value: date, from_date: Optional[date], to_date: Optional[date]) -> bool:
    if from_date and value < from_date:
        return False
    if to_date and value > to_date:
        return False
    return True


def _cycle_overlaps(cycle_start: date, cycle_end: date, range_start: date, range_end: date) -> bool:
    return not (cycle_end < range_start or cycle_start > range_end)


@router.get("", response_model=TimelineResponse)
def get_timeline(
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
    today: date = Depends(get_today),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
) -> TimelineResponse:
    stmt = (
        select(LicenseCycle, StateLicense.state_code, StateLicense.license_number)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(StateLicense.user_id == current_user.id)
        .order_by(StateLicense.state_code.asc(), LicenseCycle.cycle_end.asc())
    )

    if from_date:
        stmt = stmt.where(LicenseCycle.cycle_end >= from_date)
    if to_date:
        stmt = stmt.where(LicenseCycle.cycle_start <= to_date)

    cycle_rows = session.execute(stmt).all()
    if not cycle_rows:
        return TimelineResponse(states=[])

    cycle_ids = [cycle.id for cycle, _state, _license_number in cycle_rows]
    cycle_state: Dict[uuid.UUID, str] = {
        cycle.id: state_code for cycle, state_code, _license_number in cycle_rows
    }

    allocation_rows = session.execute(
        select(CreditAllocation.license_cycle_id, CourseCredit)
        .join(CourseCredit, CreditAllocation.course_credit_id == CourseCredit.id)
        .where(
            CreditAllocation.license_cycle_id.in_(cycle_ids),
            CourseCredit.user_id == current_user.id,
        )
    ).all()

    course_ids = {course.id for _cycle_id, course in allocation_rows}
    cert_rows = []
    if course_ids:
        cert_rows = session.scalars(
            select(Certificate).where(Certificate.course_credit_id.in_(course_ids))
        ).all()

    certs_by_course: Dict[uuid.UUID, List[TimelineCertificate]] = defaultdict(list)
    for cert in cert_rows:
        certs_by_course[cert.course_credit_id].append(TimelineCertificate.model_validate(cert))

    course_payloads: Dict[uuid.UUID, TimelineCourse] = {}
    for _cycle_id, course in allocation_rows:
        if course.id in course_payloads:
            continue
        certs = certs_by_course.get(course.id, [])
        course_payloads[course.id] = TimelineCourse(
            id=course.id,
            title=course.title,
            provider=course.provider,
            completed_at=course.completed_at,
            hours=_to_decimal(course.hours),
            has_certificate=len(certs) > 0,
            certificates=certs,
        )

    courses_by_cycle: Dict[uuid.UUID, List[TimelineCourse]] = defaultdict(list)
    earned_by_cycle: Dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    course_state_cycles: Dict[tuple[str, uuid.UUID], Dict[str, object]] = {}

    for cycle_id, course in allocation_rows:
        courses_by_cycle[cycle_id].append(course_payloads[course.id])
        earned_by_cycle[cycle_id] += _to_decimal(course.hours)

        state_code = cycle_state.get(cycle_id, "")
        key = (state_code, course.id)
        if key not in course_state_cycles:
            course_state_cycles[key] = {
                "course_title": course.title,
                "cycle_ids": set(),
            }
        course_state_cycles[key]["cycle_ids"].add(cycle_id)

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

    states_map: Dict[str, TimelineState] = {}
    for cycle, state_code, license_number in cycle_rows:
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

        if state_code not in states_map:
            states_map[state_code] = TimelineState(
                state_code=state_code,
                license_number=license_number,
                cycles=[],
            )

        cycle_courses = sorted(
            courses_by_cycle.get(cycle.id, []),
            key=lambda item: item.completed_at,
        )

        states_map[state_code].cycles.append(
            TimelineCycle(
                id=cycle.id,
                state_license_id=cycle.state_license_id,
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
                courses=cycle_courses,
            )
        )

    states = sorted(states_map.values(), key=lambda item: item.state_code)
    return TimelineResponse(states=states)


@router.get("/events", response_model=List[TimelineEvent])
def get_timeline_events(
    session: Session = Depends(get_db_session),
    current_user: User = Depends(get_current_user),
    today: date = Depends(get_today),
    from_date: Optional[date] = Query(None, alias="from"),
    to_date: Optional[date] = Query(None, alias="to"),
    state: Optional[str] = Query(None),
) -> List[TimelineEvent]:
    cycle_stmt = (
        select(LicenseCycle, StateLicense.state_code)
        .join(StateLicense, LicenseCycle.state_license_id == StateLicense.id)
        .where(StateLicense.user_id == current_user.id)
        .order_by(StateLicense.state_code.asc(), LicenseCycle.cycle_end.asc())
    )
    if state:
        cycle_stmt = cycle_stmt.where(StateLicense.state_code == state.upper())

    cycle_rows = session.execute(cycle_stmt).all()
    cycle_ids = [cycle.id for cycle, _state in cycle_rows]
    cycle_map: Dict[uuid.UUID, LicenseCycle] = {cycle.id: cycle for cycle, _state in cycle_rows}
    cycle_state: Dict[uuid.UUID, str] = {cycle.id: state_code for cycle, state_code in cycle_rows}

    allocation_rows = []
    if cycle_ids:
        allocation_rows = session.execute(
            select(
                CreditAllocation.license_cycle_id,
                CourseCredit,
                LicenseCycle.cycle_start,
                LicenseCycle.cycle_end,
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

    courses = session.scalars(
        select(CourseCredit).where(CourseCredit.user_id == current_user.id)
    ).all()
    course_map: Dict[uuid.UUID, CourseCredit] = {course.id: course for course in courses}

    course_ids = set(course_map.keys())
    cert_rows = []
    if course_ids:
        cert_rows = session.scalars(
            select(Certificate).where(Certificate.course_credit_id.in_(course_ids))
        ).all()

    certs_by_course: Dict[uuid.UUID, List[dict]] = defaultdict(list)
    for cert in cert_rows:
        certs_by_course[cert.course_credit_id].append(
            {
                "id": cert.id,
                "filename": cert.filename,
                "content_type": cert.content_type,
                "size_bytes": cert.size_bytes,
                "created_at": cert.created_at,
            }
        )

    allocations_by_course: Dict[uuid.UUID, List[dict]] = defaultdict(list)
    courses_by_cycle: Dict[uuid.UUID, List[dict]] = defaultdict(list)
    states_by_course: Dict[uuid.UUID, set[str]] = defaultdict(set)
    earned_by_cycle: Dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0"))
    course_state_cycles: Dict[tuple[str, uuid.UUID], Dict[str, object]] = {}

    for cycle_id, course, cycle_start, cycle_end, state_code in allocation_rows:
        allocations_by_course[course.id].append(
            {
                "cycle_id": cycle_id,
                "state_code": state_code,
                "cycle_start": cycle_start,
                "cycle_end": cycle_end,
            }
        )
        courses_by_cycle[cycle_id].append(
            {
                "id": course.id,
                "title": course.title,
                "completed_at": course.completed_at,
                "hours": _to_decimal(course.hours),
                "has_certificate": len(certs_by_course.get(course.id, [])) > 0,
            }
        )
        states_by_course[course.id].add(state_code)
        earned_by_cycle[cycle_id] += _to_decimal(course.hours)

        key = (state_code, course.id)
        if key not in course_state_cycles:
            course_state_cycles[key] = {
                "course_title": course.title,
                "cycle_ids": set(),
            }
        course_state_cycles[key]["cycle_ids"].add(cycle_id)

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

    events: List[TimelineEvent] = []

    for course in courses:
        course_states = sorted(states_by_course.get(course.id, set()))
        if state and state.upper() not in course_states:
            continue
        occurred_at = course.completed_at
        if not _in_range(occurred_at, from_date, to_date):
            continue
        badges = course_states.copy()
        meta = {
            "course": {
                "id": course.id,
                "title": course.title,
                "provider": course.provider,
                "completed_at": course.completed_at,
                "hours": _to_decimal(course.hours),
                "has_certificate": len(certs_by_course.get(course.id, [])) > 0,
            },
            "certificates": certs_by_course.get(course.id, []),
            "allocations": allocations_by_course.get(course.id, []),
        }
        events.append(
            TimelineEvent(
                id=f"course_completed:{course.id}",
                kind="course_completed",
                occurred_at=occurred_at,
                state_code=course_states[0] if len(course_states) == 1 else None,
                course_id=course.id,
                title=course.title,
                subtitle=f"{_to_decimal(course.hours)} hrs",
                badges=badges or None,
                meta=meta,
            )
        )

    for cert in cert_rows:
        course = course_map.get(cert.course_credit_id)
        if not course:
            continue
        course_states = sorted(states_by_course.get(course.id, set()))
        if state and state.upper() not in course_states:
            continue
        occurred_at = cert.created_at.date()
        if not _in_range(occurred_at, from_date, to_date):
            continue
        badges = course_states.copy()
        badges.append("certificate")
        meta = {
            "course": {
                "id": course.id,
                "title": course.title,
                "provider": course.provider,
                "completed_at": course.completed_at,
                "hours": _to_decimal(course.hours),
                "has_certificate": len(certs_by_course.get(course.id, [])) > 0,
            },
            "certificates": certs_by_course.get(course.id, []),
            "allocations": allocations_by_course.get(course.id, []),
        }
        events.append(
            TimelineEvent(
                id=f"certificate_uploaded:{cert.id}",
                kind="certificate_uploaded",
                occurred_at=occurred_at,
                state_code=course_states[0] if len(course_states) == 1 else None,
                course_id=course.id,
                title="Certificate uploaded",
                subtitle=course.title,
                badges=badges,
                meta=meta,
            )
        )

    active_start = from_date or (today - timedelta(days=730))
    active_end = to_date or today
    include_status_events = True
    if from_date or to_date:
        include_status_events = _in_range(today, from_date, to_date)

    for cycle_id, cycle in cycle_map.items():
        state_code = cycle_state.get(cycle_id)
        if not state_code:
            continue

        if _in_range(cycle.cycle_start, from_date, to_date):
            events.append(
                TimelineEvent(
                    id=f"cycle_started:{cycle_id}",
                    kind="cycle_started",
                    occurred_at=cycle.cycle_start,
                    state_code=state_code,
                    cycle_id=cycle_id,
                    title=f"{state_code} cycle started",
                    subtitle=f"{cycle.cycle_start} → {cycle.cycle_end}",
                    badges=[state_code],
                    meta={
                        "cycle": {
                            "id": cycle_id,
                            "state_code": state_code,
                            "cycle_start": cycle.cycle_start,
                            "cycle_end": cycle.cycle_end,
                            "required_hours": _to_decimal(cycle.required_hours),
                            "earned_hours": earned_by_cycle.get(cycle_id, Decimal("0")),
                            "remaining_hours": _to_decimal(cycle.required_hours)
                            - earned_by_cycle.get(cycle_id, Decimal("0")),
                            "percent": (
                                Decimal("1")
                                if _to_decimal(cycle.required_hours) == Decimal("0")
                                else min(
                                    earned_by_cycle.get(cycle_id, Decimal("0"))
                                    / _to_decimal(cycle.required_hours),
                                    Decimal("1"),
                                )
                            ),
                            "status": "",
                            "days_remaining": (cycle.cycle_end - today).days,
                        },
                        "courses": courses_by_cycle.get(cycle_id, []),
                    },
                )
            )

        if not include_status_events:
            continue
        if not _cycle_overlaps(cycle.cycle_start, cycle.cycle_end, active_start, active_end):
            continue

        required = _to_decimal(cycle.required_hours)
        earned = earned_by_cycle.get(cycle_id, Decimal("0"))
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
        warnings = warnings_by_cycle.get(cycle_id, [])

        status = "on_track"
        kind = None
        title = None
        if today > cycle.cycle_end and percent < Decimal("1"):
            status = "overdue"
            kind = "cycle_overdue"
            title = f"{state_code} cycle overdue"
        elif percent == Decimal("1"):
            status = "complete"
            kind = "cycle_completed"
            title = f"{state_code} cycle complete"
        elif days_remaining <= 30:
            status = "at_risk"
            kind = "cycle_due_soon"
            title = f"{state_code} cycle due soon"

        if kind:
            badges = [state_code, status.replace("_", " ")]
            if warnings:
                badges.append("warning")
            meta = {
                "cycle": {
                    "id": cycle_id,
                    "state_code": state_code,
                    "cycle_start": cycle.cycle_start,
                    "cycle_end": cycle.cycle_end,
                    "required_hours": required,
                    "earned_hours": earned,
                    "remaining_hours": remaining,
                    "percent": percent,
                    "status": status,
                    "days_remaining": days_remaining,
                },
                "courses": courses_by_cycle.get(cycle_id, []),
                "warnings": warnings,
            }
            events.append(
                TimelineEvent(
                    id=f"{kind}:{cycle_id}",
                    kind=kind,
                    occurred_at=today,
                    state_code=state_code,
                    cycle_id=cycle_id,
                    title=title,
                    subtitle=f"{cycle.cycle_start} → {cycle.cycle_end}",
                    badges=badges,
                    meta=meta,
                )
            )

    events.sort(key=lambda item: (item.occurred_at, item.title), reverse=True)
    return events
