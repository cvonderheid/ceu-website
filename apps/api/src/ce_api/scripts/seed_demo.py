from __future__ import annotations

import argparse
from datetime import date
from decimal import Decimal
from pathlib import Path
import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from ce_api.models import (
    Certificate,
    CourseCredit,
    CreditAllocation,
    LicenseCycle,
    StateLicense,
    User,
)
from ce_api.storage import get_cert_storage_dir

TRUNCATE_SQL = """
TRUNCATE certificates,
         credit_allocations,
         course_credits,
         license_cycles,
         state_licenses,
         users
RESTART IDENTITY CASCADE;
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed demo data for CE tracker")
    parser.add_argument("--reset", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--user-id", default="demo-user-1")
    parser.add_argument("--email", default="demo@example.com")
    return parser.parse_args()


def write_demo_file(storage_dir: Path, filename: str) -> tuple[str, int]:
    content = b"%PDF-1.4\n% demo\n"
    path = storage_dir / filename
    path.write_bytes(content)
    return str(path), len(content)


def seed(session: Session, user_id: str, email: str) -> None:
    user = User(external_user_id=user_id, email=email, display_name="Demo User")
    session.add(user)
    session.flush()

    ny = StateLicense(user_id=user.id, state_code="NY", license_number="NY-12345")
    nj = StateLicense(user_id=user.id, state_code="NJ", license_number="NJ-67890")
    pa = StateLicense(user_id=user.id, state_code="PA", license_number="PA-55555")
    session.add_all([ny, nj, pa])
    session.flush()

    ny_cycle1 = LicenseCycle(
        state_license_id=ny.id,
        cycle_start=date(2025, 1, 1),
        cycle_end=date(2026, 12, 31),
        required_hours=Decimal("36.0"),
    )
    ny_cycle2 = LicenseCycle(
        state_license_id=ny.id,
        cycle_start=date(2026, 1, 1),
        cycle_end=date(2027, 12, 31),
        required_hours=Decimal("36.0"),
    )
    nj_cycle1 = LicenseCycle(
        state_license_id=nj.id,
        cycle_start=date(2025, 1, 1),
        cycle_end=date(2026, 2, 15),
        required_hours=Decimal("40.0"),
    )
    pa_cycle1 = LicenseCycle(
        state_license_id=pa.id,
        cycle_start=date(2024, 1, 1),
        cycle_end=date(2026, 1, 15),
        required_hours=Decimal("30.0"),
    )
    session.add_all([ny_cycle1, ny_cycle2, nj_cycle1, pa_cycle1])
    session.flush()

    ethics = CourseCredit(
        user_id=user.id,
        title="Ethics Refresher",
        provider="CE Institute",
        completed_at=date(2025, 11, 10),
        hours=Decimal("6.0"),
    )
    trauma = CourseCredit(
        user_id=user.id,
        title="Trauma-Informed Care",
        provider="Continuing Labs",
        completed_at=date(2025, 12, 5),
        hours=Decimal("12.0"),
    )
    telehealth = CourseCredit(
        user_id=user.id,
        title="Telehealth Best Practices",
        provider="HealthTech",
        completed_at=date(2026, 1, 20),
        hours=Decimal("8.0"),
    )
    docs = CourseCredit(
        user_id=user.id,
        title="Documentation & Notes",
        provider="Clinical Skills",
        completed_at=date(2026, 1, 28),
        hours=Decimal("4.0"),
    )
    session.add_all([ethics, trauma, telehealth, docs])
    session.flush()

    allocations = [
        CreditAllocation(course_credit_id=ethics.id, license_cycle_id=ny_cycle1.id),
        CreditAllocation(course_credit_id=ethics.id, license_cycle_id=ny_cycle2.id),
        CreditAllocation(course_credit_id=trauma.id, license_cycle_id=ny_cycle2.id),
        CreditAllocation(course_credit_id=trauma.id, license_cycle_id=nj_cycle1.id),
        CreditAllocation(course_credit_id=telehealth.id, license_cycle_id=nj_cycle1.id),
        CreditAllocation(course_credit_id=docs.id, license_cycle_id=pa_cycle1.id),
    ]
    session.add_all(allocations)

    storage_dir = get_cert_storage_dir()
    ethics_path, ethics_size = write_demo_file(storage_dir, "ethics_refresher_demo.pdf")
    trauma_path, trauma_size = write_demo_file(storage_dir, "trauma_informed_demo.pdf")

    certificates = [
        Certificate(
            course_credit_id=ethics.id,
            filename="ethics_refresher_demo.pdf",
            content_type="application/pdf",
            size_bytes=ethics_size,
            blob_path=ethics_path,
        ),
        Certificate(
            course_credit_id=trauma.id,
            filename="trauma_informed_demo.pdf",
            content_type="application/pdf",
            size_bytes=trauma_size,
            blob_path=trauma_path,
        ),
    ]
    session.add_all(certificates)


def main() -> None:
    args = parse_args()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL must be set")

    engine = create_engine(database_url, pool_pre_ping=True)
    with Session(engine) as session:
        if args.reset:
            session.execute(text(TRUNCATE_SQL))
            session.commit()

        seed(session, args.user_id, args.email)
        session.commit()


if __name__ == "__main__":
    main()
