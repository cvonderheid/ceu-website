export type UserMe = {
  id: string;
  external_user_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
};

export type StateLicense = {
  id: string;
  state_code: string;
  license_number: string | null;
  created_at: string;
  updated_at: string;
};

export type LicenseCycle = {
  id: string;
  state_license_id: string;
  cycle_start: string;
  cycle_end: string;
  required_hours: string;
  created_at: string;
  updated_at: string;
};

export type Course = {
  id: string;
  title: string;
  provider: string | null;
  completed_at: string;
  hours: string;
  created_at: string;
  updated_at: string;
};

export type Allocation = {
  id: string;
  course_credit_id: string;
  license_cycle_id: string;
  created_at: string;
};

export type AllocationBulkResult = {
  created: Allocation[];
  skipped_cycle_ids: string[];
};

export type ProgressWarning = {
  kind: string;
  state_code: string;
  course_id: string;
  course_title: string;
  cycle_ids: string[];
};

export type ProgressRow = {
  cycle_id: string;
  state_code: string;
  cycle_start: string;
  cycle_end: string;
  required_hours: string;
  earned_hours: string;
  remaining_hours: string;
  percent: string;
  days_remaining: number;
  status: "overdue" | "complete" | "at_risk" | "on_track";
  warnings: ProgressWarning[];
};

export type Certificate = {
  id: string;
  course_credit_id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  blob_path: string;
  created_at: string;
};

export type TimelineCertificate = {
  id: string;
  filename: string;
  content_type: string | null;
  size_bytes: number | null;
  created_at: string;
};

export type TimelineCourse = {
  id: string;
  title: string;
  provider: string | null;
  completed_at: string;
  hours: string;
  has_certificate: boolean;
  certificates: TimelineCertificate[];
};

export type TimelineCycle = {
  id: string;
  state_license_id: string;
  state_code: string;
  cycle_start: string;
  cycle_end: string;
  required_hours: string;
  earned_hours: string;
  remaining_hours: string;
  percent: string;
  days_remaining: number;
  status: "overdue" | "complete" | "at_risk" | "on_track";
  warnings: ProgressWarning[];
  courses: TimelineCourse[];
};

export type TimelineState = {
  state_code: string;
  license_number: string | null;
  cycles: TimelineCycle[];
};

export type TimelineResponse = {
  states: TimelineState[];
};

export type TimelineEvent = {
  id: string;
  kind:
    | "course_completed"
    | "certificate_uploaded"
    | "cycle_started"
    | "cycle_due_soon"
    | "cycle_overdue"
    | "cycle_completed";
  occurred_at: string;
  state_code?: string | null;
  cycle_id?: string | null;
  course_id?: string | null;
  title: string;
  subtitle?: string | null;
  badges?: string[] | null;
  meta?: Record<string, any> | null;
};
