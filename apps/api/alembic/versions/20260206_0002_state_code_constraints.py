"""enforce normalized state license codes

Revision ID: 20260206_0002
Revises: 20260131_0001
Create Date: 2026-02-06 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20260206_0002"
down_revision = "20260131_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    duplicates = bind.execute(
        sa.text(
            """
            SELECT user_id::text AS user_id, UPPER(state_code) AS state_code, COUNT(*) AS count
            FROM state_licenses
            GROUP BY user_id, UPPER(state_code)
            HAVING COUNT(*) > 1
            ORDER BY user_id, state_code
            LIMIT 5
            """
        )
    ).all()
    if duplicates:
        preview = ", ".join(
            f"{row.user_id}:{row.state_code} ({row.count})" for row in duplicates
        )
        raise RuntimeError(
            "Cannot normalize state_licenses.state_code because case-insensitive duplicates "
            f"exist. Resolve duplicates first. Examples: {preview}"
        )

    op.execute(
        """
        UPDATE state_licenses
        SET state_code = UPPER(state_code)
        WHERE state_code <> UPPER(state_code)
        """
    )

    op.create_check_constraint(
        "ck_state_licenses_state_code_format",
        "state_licenses",
        "state_code ~ '^[A-Z]{2}$'",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_state_licenses_state_code_format",
        "state_licenses",
        type_="check",
    )
