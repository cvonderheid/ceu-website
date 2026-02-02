import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    external_user_id: str
    email: Optional[str]
    display_name: Optional[str]
    created_at: datetime


class StateLicenseBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state_code: str = Field(min_length=2, max_length=2)
    license_number: Optional[str] = None


class StateLicenseCreate(StateLicenseBase):
    pass


class StateLicenseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    license_number: Optional[str] = None


class StateLicenseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    state_code: str
    license_number: Optional[str]
    created_at: datetime
    updated_at: datetime


class LicenseCycleBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    state_license_id: uuid.UUID
    cycle_start: date
    cycle_end: date
    required_hours: Decimal


class LicenseCycleCreate(LicenseCycleBase):
    pass


class LicenseCycleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cycle_start: Optional[date] = None
    cycle_end: Optional[date] = None
    required_hours: Optional[Decimal] = None


class LicenseCycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    state_license_id: uuid.UUID
    cycle_start: date
    cycle_end: date
    required_hours: Decimal
    created_at: datetime
    updated_at: datetime


class CourseBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str
    provider: Optional[str] = None
    completed_at: date
    hours: Decimal


class CourseCreate(CourseBase):
    pass


class CourseUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Optional[str] = None
    provider: Optional[str] = None
    completed_at: Optional[date] = None
    hours: Optional[Decimal] = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    provider: Optional[str]
    completed_at: date
    hours: Decimal
    created_at: datetime
    updated_at: datetime


class AllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_credit_id: uuid.UUID
    license_cycle_id: uuid.UUID
    created_at: datetime


class AllocationBulkCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    course_id: uuid.UUID
    cycle_ids: List[uuid.UUID]


class AllocationBulkResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    created: List[AllocationOut]
    skipped_cycle_ids: List[uuid.UUID]


class ProgressWarning(BaseModel):
    model_config = ConfigDict(extra="forbid")

    kind: str
    state_code: str
    course_id: uuid.UUID
    course_title: str
    cycle_ids: List[uuid.UUID]


class ProgressOut(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cycle_id: uuid.UUID
    state_code: str
    cycle_start: date
    cycle_end: date
    required_hours: Decimal
    earned_hours: Decimal
    remaining_hours: Decimal
    percent: Decimal
    days_remaining: int
    status: str
    warnings: List[ProgressWarning]


class CertificateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_credit_id: uuid.UUID
    filename: str
    content_type: Optional[str]
    size_bytes: Optional[int]
    blob_path: str
    created_at: datetime
