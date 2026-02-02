"""initial schema

Revision ID: 20260131_0001
Revises: None
Create Date: 2026-01-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "20260131_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("external_user_id", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("external_user_id", name="uq_users_external_user_id"),
    )

    op.create_table(
        "state_licenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state_code", sa.String(length=2), nullable=False),
        sa.Column("license_number", sa.String(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_state_licenses_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_state_licenses"),
        sa.UniqueConstraint("user_id", "state_code", name="uq_state_licenses_user_id"),
    )

    op.create_table(
        "license_cycles",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("state_license_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cycle_start", sa.Date(), nullable=False),
        sa.Column("cycle_end", sa.Date(), nullable=False),
        sa.Column("required_hours", sa.Numeric(6, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["state_license_id"],
            ["state_licenses.id"],
            name="fk_license_cycles_state_license_id_state_licenses",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_license_cycles"),
    )
    op.create_index("ix_license_cycles_state_license_id", "license_cycles", ["state_license_id"])
    op.create_index("ix_license_cycles_cycle_end", "license_cycles", ["cycle_end"])

    op.create_table(
        "course_credits",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("provider", sa.String(), nullable=True),
        sa.Column("completed_at", sa.Date(), nullable=False),
        sa.Column("hours", sa.Numeric(6, 2), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_course_credits_user_id_users",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_course_credits"),
    )
    op.create_index(
        "ix_course_credits_user_id",
        "course_credits",
        ["user_id", "completed_at"],
    )

    op.create_table(
        "credit_allocations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_credit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("license_cycle_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["course_credit_id"],
            ["course_credits.id"],
            name="fk_credit_allocations_course_credit_id_course_credits",
        ),
        sa.ForeignKeyConstraint(
            ["license_cycle_id"],
            ["license_cycles.id"],
            name="fk_credit_allocations_license_cycle_id_license_cycles",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_credit_allocations"),
        sa.UniqueConstraint(
            "course_credit_id",
            "license_cycle_id",
            name="uq_credit_allocations_course_credit_id",
        ),
    )

    op.create_table(
        "certificates",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("course_credit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("blob_path", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["course_credit_id"],
            ["course_credits.id"],
            name="fk_certificates_course_credit_id_course_credits",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_certificates"),
    )
    op.create_index("ix_certificates_course_credit_id", "certificates", ["course_credit_id"])


def downgrade() -> None:
    op.drop_index("ix_certificates_course_credit_id", table_name="certificates")
    op.drop_table("certificates")
    op.drop_table("credit_allocations")
    op.drop_index("ix_course_credits_user_id", table_name="course_credits")
    op.drop_table("course_credits")
    op.drop_index("ix_license_cycles_cycle_end", table_name="license_cycles")
    op.drop_index("ix_license_cycles_state_license_id", table_name="license_cycles")
    op.drop_table("license_cycles")
    op.drop_table("state_licenses")
    op.drop_table("users")
