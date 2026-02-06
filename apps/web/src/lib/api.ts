import type {
  Allocation,
  AllocationBulkResult,
  Certificate,
  Course,
  LicenseCycle,
  ProgressRow,
  StateLicense,
  TimelineEvent,
  TimelineResponse,
  UserMe,
} from "@/lib/types";
import { beginLogin, getValidAccessToken, isAuthConfigured, refreshAccessToken } from "@/lib/auth";

const API_BASE = "";
let loginRedirectStarted = false;

export class ApiError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.details || fallback;
  }
  return fallback;
}

async function parseError(response: Response) {
  try {
    const data = await response.json();
    if (data?.detail) {
      return String(data.detail);
    }
  } catch {
    return undefined;
  }
  return undefined;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const triggerLoginRedirect = () => {
    if (!isAuthConfigured() || loginRedirectStarted) {
      return;
    }
    loginRedirectStarted = true;
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    void beginLogin(returnTo).catch(() => {
      loginRedirectStarted = false;
    });
  };

  const makeRequest = async (token: string | null) => {
    const headers = new Headers(options.headers || {});
    if (!(options.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  };

  let token = await getValidAccessToken();
  let response = await makeRequest(token);

  if (response.status === 401 && isAuthConfigured()) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      token = await getValidAccessToken();
      response = await makeRequest(token);
    } else {
      triggerLoginRedirect();
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (!response.ok) {
    if (response.status === 401) {
      triggerLoginRedirect();
    }
    const details = await parseError(response);
    throw new ApiError("Request failed", response.status, details);
  }

  return response.json() as Promise<T>;
}

function toQuery(params: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  getMe: () => apiFetch<UserMe>("/api/me"),

  listStateLicenses: () => apiFetch<StateLicense[]>("/api/state-licenses"),
  createStateLicense: (payload: { state_code: string; license_number?: string | null }) =>
    apiFetch<StateLicense>("/api/state-licenses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateStateLicense: (id: string, payload: { license_number?: string | null }) =>
    apiFetch<StateLicense>(`/api/state-licenses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteStateLicense: (id: string) =>
    apiFetch<void>(`/api/state-licenses/${id}`, { method: "DELETE" }),

  listCycles: (stateLicenseId?: string) =>
    apiFetch<LicenseCycle[]>(
      `/api/cycles${toQuery({ state_license_id: stateLicenseId })}`
    ),
  createCycle: (payload: {
    state_license_id: string;
    cycle_start: string;
    cycle_end: string;
    required_hours: string;
  }) =>
    apiFetch<LicenseCycle>("/api/cycles", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCycle: (
    id: string,
    payload: {
      cycle_start?: string | null;
      cycle_end?: string | null;
      required_hours?: string | null;
    }
  ) =>
    apiFetch<LicenseCycle>(`/api/cycles/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCycle: (id: string) => apiFetch<void>(`/api/cycles/${id}`, { method: "DELETE" }),

  listCourses: (params?: { from?: string; to?: string }) =>
    apiFetch<Course[]>(`/api/courses${toQuery({ from: params?.from, to: params?.to })}`),
  createCourse: (payload: {
    title: string;
    provider?: string | null;
    completed_at: string;
    hours: string;
  }) =>
    apiFetch<Course>("/api/courses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateCourse: (
    id: string,
    payload: {
      title?: string | null;
      provider?: string | null;
      completed_at?: string | null;
      hours?: string | null;
    }
  ) =>
    apiFetch<Course>(`/api/courses/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  deleteCourse: (id: string) => apiFetch<void>(`/api/courses/${id}`, { method: "DELETE" }),

  bulkAllocate: (payload: { course_id: string; cycle_ids: string[] }) =>
    apiFetch<AllocationBulkResult>("/api/allocations/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  listAllocations: (params?: { course_id?: string; cycle_id?: string }) =>
    apiFetch<Allocation[]>(`/api/allocations${toQuery(params ?? {})}`),
  deleteAllocation: (id: string) =>
    apiFetch<void>(`/api/allocations/${id}`, { method: "DELETE" }),

  listCertificates: (courseId: string) =>
    apiFetch<Certificate[]>(`/api/courses/${courseId}/certificates`),
  uploadCertificate: async (courseId: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiFetch<Certificate>(`/api/courses/${courseId}/certificates`, {
      method: "POST",
      body,
    });
  },
  deleteCertificate: (id: string) =>
    apiFetch<void>(`/api/certificates/${id}`, { method: "DELETE" }),

  getProgress: () => apiFetch<ProgressRow[]>("/api/progress"),
  getTimeline: (params?: { from?: string; to?: string }) =>
    apiFetch<TimelineResponse>(`/api/timeline${toQuery({ from: params?.from, to: params?.to })}`),
  getTimelineEvents: (params?: { from?: string; to?: string; state?: string }) =>
    apiFetch<TimelineEvent[]>(
      `/api/timeline/events${toQuery({ from: params?.from, to: params?.to, state: params?.state })}`
    ),
};
