// lib/api.ts
// ─────────────────────────────────────────────────────────────────────────────
// Central API service — replace MOCK data with these real Laravel calls
// ─────────────────────────────────────────────────────────────────────────────

function normalizeApiBaseUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api")) return trimmed;
  return `${trimmed}/api`;
}

export function getApiBaseUrl(): string {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (envUrl && envUrl.trim()) {
    return normalizeApiBaseUrl(envUrl);
  }

  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    // In local dev, Next.js usually runs on 3000 while Laravel runs on 8000.
    if (/localhost:3000|127\.0\.0\.1:3000/i.test(origin)) {
      return "http://localhost:8000/api";
    }
    return `${origin}/api`;
  }

  return "http://localhost:8000/api";
}

// ── Token helpers ─────────────────────────────────────────────────────────────
export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("cp_token");
}

export function setToken(token: string): void {
  localStorage.setItem("cp_token", token);
}

export function removeToken(): void {
  localStorage.removeItem("cp_token");
}

// ── API Error type ────────────────────────────────────────────────────────────
export interface ApiError {
  status?: number;
  message?: string;
  errors?: Record<string, string[]>;
}

function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Some backend setups prepend/append noise around JSON.
    const firstBrace = trimmed.search(/[\[{]/);
    if (firstBrace > 0) {
      try {
        return JSON.parse(trimmed.slice(firstBrace));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const url = `${getApiBaseUrl()}${endpoint}`;
  console.log("API Request:", url, options.method || "GET");

  const res = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // Check if response is JSON
  const contentType = res.headers.get("content-type") || "";
  const isJsonResponse = contentType.includes("application/json");

  const rawText = await res.text();
  const parsed = tryParseJson(rawText);

  if (!isJsonResponse && parsed === null) {
    console.error("Non-JSON response:", rawText.substring(0, 500));

    const looksLikeHtml =
      rawText.trim().startsWith("<") ||
      rawText.toLowerCase().includes("<!doctype html");

    let message =
      "Server returned non-JSON response. Please check if API endpoint is correct.";
    if (looksLikeHtml) {
      message =
        "Server returned HTML instead of JSON. Please verify API URL and backend deployment.";
    } else if (rawText.trim()) {
      message = rawText.trim().slice(0, 200);
    }

    const error: ApiError = {
      status: res.status,
      message,
    };
    throw error;
  }

  if (parsed === null) {
    const error: ApiError = {
      status: res.status,
      message: "Server returned invalid JSON. Please check backend logs.",
    };
    throw error;
  }

  const data = parsed as Record<string, unknown>;

  if (!res.ok) {
    const providerEndpoints = Array.isArray(data?.tried_provider_endpoints)
      ? ` Tried provider endpoints: ${(data.tried_provider_endpoints as unknown[])
          .map((item) => String(item))
          .join(", ")}`
      : "";
    const providerEndpoint =
      typeof data?.provider_endpoint === "string"
        ? ` Provider endpoint: ${data.provider_endpoint}.`
        : "";

    // Throw structured error so callers can read .errors / .message
    const error: ApiError = {
      status: res.status,
      ...(typeof data === "object" && data !== null ? data : {}),
      message:
        (typeof data?.message === "string" && data.message) ||
        (typeof data?.detail === "string" &&
          `${data.detail}.${providerEndpoint}${providerEndpoints}`) ||
        `Request failed with status ${res.status}`,
    };
    throw error;
  }

  return data as T;
}

// ══════════════════════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface ApiUser {
  id: number;
  company_id?: number;
  name: string;
  email: string;
  company_name: string;
  developer_name?: string;
  gst_no?: string;
  company_size?: string;
  profile_image?: string;
  profile_image_url?: string;
  rera_no: string;
  phone: string;
  city?: string;
  state?: string;
  pincode?: string;
  address: string;
  experience_level?: string;
  primary_market?: string[];
  micro_markets?: string;
  sell_cities?: string;
  avg_leads_per_month?: number;
  avg_site_visits_per_month?: number;
  avg_closures_per_month?: number;
  role:
    | "user"
    | "admin"
    | "developer_super_admin"
    | "sourcing_admin"
    | "sales_user";
  assigned_projects?: string[];
  is_company_owner?: boolean;
  is_active: boolean;
  email_verified: boolean;
  unique_key?: string;
  created_at: string;
}

// Project Meeting Interface
export interface ProjectMeeting {
  project_name: string;
  meeting_date: string;
  meeting_time: string;
  scheduled_at?: string;
  has_session_link?: boolean;
  session_link_count?: number;
  latest_session_link_id?: number | null;
  latest_session_created_at?: string | null;
  latest_session_status?: string | null;
  latest_session_started_at?: string | null;
  latest_session_ended_at?: string | null;
  latest_session_joinees?: number;
  latest_session_event_count?: number;
  created_by_id?: number;
  created_by_name?: string;
  updated_by_id?: number;
  updated_by_name?: string;
  assigned_to_user_id?: number;
  assigned_to_user_name?: string;
}

// Customer Interface with multiple projects support
export interface Customer {
  id: number;
  user_id: number;
  user?: {
    id?: number;
    name: string;
    email?: string;
    company_name?: string;
    company_id?: number;
  };
  nickname: string;
  secret_code: string;
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  company_id?: number;
  projects?: ProjectMeeting[]; // Array of multiple project meetings
  // Backward compatibility fields
  meeting_date?: string;
  meeting_time?: string;
  project_name?: string;
  has_session_link?: boolean;
  session_link_count?: number;
  notes?: string;
  status: "active" | "inactive" | "Booked";
  is_active?: number;
  created_at: string;
  updated_at: string;
}

export interface LinkedProjectCard {
  id?: number;
  title: string;
  presentation_id?: string;
  developer?: string;
  location?: string;
  price?: string;
  image_url?: string;
  showcase_url?: string;
  showcase_urls?: string[];
  unit_types?: string;
  area?: string;
  possession?: string;
  status?: string;
  units_left?: number;
  meeting_date?: string;
  meeting_time?: string;
  project_key?: string;
  attempt_count?: number;
  attempts_left?: number;
  is_locked?: boolean;
  real_estate_categories?: string[];
}

export interface CustomerProjectLink {
  id: number;
  user_id: number;
  customer_id: number;
  public_token: string;
  selected_projects: LinkedProjectCard[];
  liked_projects?: LinkedProjectCard[];
  card_attempts?: Record<string, number>;
  locked_project_keys?: string[];
  expires_at?: string;
  is_disabled?: boolean;
  disabled_at?: string;
  status: string;
  sent_at?: string;
  opened_at?: string;
  last_interaction_at?: string;
  created_at: string;
  customer?: {
    id: number;
    nickname?: string;
    name?: string;
    phone?: string;
    secret_code?: string;
  };
  user?: {
    id: number;
    name?: string;
    company_name?: string;
  };
}

export interface PublicCustomerProjectLink {
  id: number;
  public_token: string;
  status: string;
  selected_projects: LinkedProjectCard[];
  liked_projects?: LinkedProjectCard[];
  self_view_links?: PublicSelfViewLink[];
  expires_at?: string;
  is_disabled?: boolean;
  max_attempts_per_card?: number;
  locked_project_keys?: string[];
  customer?: {
    id: number;
    nickname?: string;
    name?: string;
    phone?: string;
    secret_code?: string;
  };
}

export interface PublicSelfViewLink {
  id: number;
  project_key: string;
  project_name?: string;
  presentation_id?: string;
  session_token: string;
  status?: string;
  ended_at?: string | null;
  is_completed?: boolean;
  self_view_url?: string;
  self_view_url_with_phone?: string;
  self_view_expires_at?: string;
  viewer_link?: string;
  meeting_date?: string;
  meeting_time?: string;
  created_at?: string;
}

export interface CustomerSessionLink {
  id: number;
  user_id: number;
  customer_id: number;
  project_name?: string;
  presentation_id: string;
  presentation_title?: string;
  presenter_name: string;
  presenter_email?: string;
  presenter_platform_id?: string;
  viewer_name: string;
  viewer_email?: string;
  viewer_phone?: string;
  viewer_platform_id?: string;
  session_token: string;
  session_code?: string;
  join_code?: string;
  status?: string;
  started_at?: string | null;
  ended_at?: string | null;
  joinees?: number;
  event_count?: number;
  presenter_link: string;
  viewer_link: string;
  viewer_link_with_phone?: string;
  self_view_url?: string;
  self_view_url_with_phone?: string;
  self_view_expires_at?: string;
  meeting_date?: string;
  meeting_time?: string;
  analytics_payload?: Record<string, unknown>;
  summary_payload?: Record<string, unknown>;
  feedback_payload?: Array<Record<string, unknown>>;
  summary_generated_at?: string;
  last_webhook_at?: string;
  raw_response?: Record<string, unknown>;
  expires_at?: string;
  created_at: string;
}

export interface CustomerSessionStatusSnapshot {
  session_token: string;
  status?: string;
  join_state?: string;
  joinees?: number;
  event_count?: number;
  started_at?: string;
  ended_at?: string;
  is_expired?: boolean;
  presenter_link?: string;
  viewer_link?: string;
  self_view_url?: string;
  error?: string | null;
}

export interface ConectrCustomerAnalyticsEvent {
  type?: string;
  slide?: string;
  label?: string;
  action_type?: string;
  option?: string;
  duration_seconds?: number;
  created_at?: string;
  data?: Record<string, unknown> | null;
  [key: string]: unknown;
}

export interface ConectrCustomerAnalyticsSession {
  session_token: string;
  session_code?: string;
  presentation_id?: string;
  presentation_title?: string;
  presenter_name?: string;
  viewer_name?: string;
  viewer_id?: string;
  developer_id?: string;
  status?: string;
  created_at?: string;
  started_at?: string;
  ended_at?: string;
  event_count?: number;
  events?: ConectrCustomerAnalyticsEvent[];
  summary?: Record<string, unknown> | { summary?: Record<string, unknown> };
  feedback_submissions?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

export interface ConectrCustomerAnalyticsResponse {
  customer?: {
    viewer_id?: string;
    viewer_name?: string;
    total_sessions?: number;
    presentations_viewed?: string[];
    developers_interacted?: string[];
    total_events?: number;
    [key: string]: unknown;
  };
  sessions?: ConectrCustomerAnalyticsSession[];
  [key: string]: unknown;
}

export interface CreateCustomerSessionLinkPayload {
  customer_id: number;
  project_name?: string;
  presentation_id: string;
  presenter_name: string;
  presenter_email?: string;
  presenter_id?: string;
  viewer_name: string;
  viewer_email?: string;
  viewer_phone?: string;
  viewer_id?: string;
  frontend_url?: string;
  expires_in_hours?: number;
  meeting_date?: string;
  meeting_time?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
//  AUTH API
// ══════════════════════════════════════════════════════════════════════════════

export interface RegisterPayload {
  name: string;
  company_name: string;
  company_size: string;
  rera_no: string;
  phone: string;
  city: string;
  email: string;
  address: string;
  password: string;
  password_confirmation: string;
}

export interface ProfileUpdatePayload {
  name?: string;
  company_name?: string;
  developer_name?: string;
  company_size?: string;
  profile_image?: File;
  rera_no?: string;
  gst_no?: string;
  phone?: string;
  city?: string;
  state?: string;
  pincode?: string;
  address?: string;
  experience_level?: string;
  primary_market?: string[];
  micro_markets?: string;
  sell_cities?: string;
  avg_leads_per_month?: number;
  avg_site_visits_per_month?: number;
  avg_closures_per_month?: number;
  password?: string;
  password_confirmation?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ForgotPasswordSendCodePayload {
  email: string;
}

export interface ForgotPasswordResetPayload {
  email: string;
  code: string;
  password: string;
  password_confirmation: string;
}

export interface AuthResponse {
  message: string;
  user: ApiUser;
  token?: string;
  email_verified?: boolean;
}

export const AuthAPI = {
  register: (payload: RegisterPayload) =>
    apiFetch<AuthResponse>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  login: (payload: LoginPayload) =>
    apiFetch<AuthResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  logout: () =>
    apiFetch<{ message: string }>("/auth/logout", { method: "POST" }),

  me: (signal?: AbortSignal) =>
    apiFetch<{ user: ApiUser; email_verified: boolean }>("/auth/me", {
      signal,
    }),

  updateProfile: (payload: ProfileUpdatePayload | FormData) => {
    if (typeof FormData !== "undefined" && payload instanceof FormData) {
      return apiFetch<{ message: string; user: ApiUser }>("/auth/profile", {
        method: "POST",
        body: payload,
      });
    }

    return apiFetch<{ message: string; user: ApiUser }>("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  resendVerification: () =>
    apiFetch<{ message: string }>("/auth/email/resend", { method: "POST" }),

  forgotPasswordSendCode: (payload: ForgotPasswordSendCodePayload) =>
    apiFetch<{ message: string }>("/auth/forgot-password/send-code", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  forgotPasswordReset: (payload: ForgotPasswordResetPayload) =>
    apiFetch<{ message: string }>("/auth/forgot-password/reset", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  ADMIN API
// ══════════════════════════════════════════════════════════════════════════════

export interface AdminStats {
  total_users: number;
  verified_users: number;
  unverified_users: number;
  active_users: number;
}

export type UpdateUserPayload = Partial<
  Pick<
    ApiUser,
    "name" | "company_name" | "rera_no" | "phone" | "address" | "is_active"
  >
>;

export const AdminAPI = {
  stats: () => apiFetch<AdminStats>("/admin/stats"),

  // Users
  listUsers: (search?: string, verified?: boolean) => {
    const params = new URLSearchParams();
    if (search !== undefined) params.set("search", search);
    if (verified !== undefined) params.set("verified", String(verified));
    const qs = params.toString() ? `?${params}` : "";
    return apiFetch<{ data: ApiUser[]; total: number }>(`/admin/users${qs}`);
  },

  updateUser: (id: number, payload: UpdateUserPayload) =>
    apiFetch<{ message: string; user: ApiUser }>(`/admin/users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  deleteUser: (id: number) =>
    apiFetch<{ message: string }>(`/admin/users/${id}`, { method: "DELETE" }),
};

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

export interface UserListResponse<T> {
  data: T[];
  total: number;
  deleted_data?: T[];
  deleted_total?: number;
}

// ══════════════════════════════════════════════════════════════════════════════
//  DEVELOPER USER API
// ══════════════════════════════════════════════════════════════════════════════

export interface DeveloperUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  developer_name: string;
  assigned_projects?: string[];
  rera_no?: string;
  gst_no?: string;
  unique_key: string;
  role: string;
  is_active: boolean;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_name?: string | null;
}

export interface CreateDeveloperUserPayload {
  name: string;
  email: string;
  phone?: string;
  developer_name: string;
  rera_no?: string;
  gst_no?: string;
  address?: string;
  password: string;
  password_confirmation: string;
}

export interface UpdateDeveloperUserPayload {
  name?: string;
  email?: string;
  phone?: string;
  developer_name?: string;
  rera_no?: string;
  gst_no?: string;
  address?: string;
  is_active?: boolean;
  password?: string;
  password_confirmation?: string;
}

export const DeveloperUserAPI = {
  list: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<UserListResponse<DeveloperUser>>(
      `/developer-users${params}`,
    );
  },

  get: (id: number) =>
    apiFetch<{ data: DeveloperUser }>(`/developer-users/${id}`),

  create: (payload: CreateDeveloperUserPayload) =>
    apiFetch<{ message: string; data: DeveloperUser }>("/developer-users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: number, payload: UpdateDeveloperUserPayload) =>
    apiFetch<{ message: string; data: DeveloperUser }>(
      `/developer-users/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),

  delete: (id: number) =>
    apiFetch<{ message: string }>(`/developer-users/${id}`, {
      method: "DELETE",
    }),

  restore: (id: number) =>
    apiFetch<{ message: string; data: DeveloperUser }>(
      `/developer-users/${id}/restore`,
      {
        method: "POST",
      },
    ),

  forceDelete: (id: number) =>
    apiFetch<{ message: string }>(`/developer-users/${id}/force-delete`, {
      method: "DELETE",
    }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  SOURCING MANAGER API
// ══════════════════════════════════════════════════════════════════════════════

export interface SourcingManager {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  developer_name?: string;
  assigned_projects: string[];
  role: string;
  is_active: boolean;
  parent_user_id?: number;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_name?: string | null;
}

export interface CreateSourcingManagerPayload {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  assigned_projects?: string[];
  password: string;
  password_confirmation: string;
}

export interface UpdateSourcingManagerPayload {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  assigned_projects?: string[];
  is_active?: boolean;
  password?: string;
  password_confirmation?: string;
}

export const SourcingManagerAPI = {
  list: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<UserListResponse<SourcingManager>>(
      `/sourcing-managers${params}`,
    );
  },

  get: (id: number) =>
    apiFetch<{ data: SourcingManager }>(`/sourcing-managers/${id}`),

  create: (payload: CreateSourcingManagerPayload) =>
    apiFetch<{ message: string; data: SourcingManager }>("/sourcing-managers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: number, payload: UpdateSourcingManagerPayload) =>
    apiFetch<{ message: string; data: SourcingManager }>(
      `/sourcing-managers/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),

  delete: (id: number) =>
    apiFetch<{ message: string }>(`/sourcing-managers/${id}`, {
      method: "DELETE",
    }),

  restore: (id: number) =>
    apiFetch<{ message: string; data: SourcingManager }>(
      `/sourcing-managers/${id}/restore`,
      {
        method: "POST",
      },
    ),

  forceDelete: (id: number) =>
    apiFetch<{ message: string }>(`/sourcing-managers/${id}/force-delete`, {
      method: "DELETE",
    }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  SALES USER API
// ══════════════════════════════════════════════════════════════════════════════

export interface SalesUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  developer_name?: string;
  assigned_projects: string[];
  role: string;
  is_active: boolean;
  parent_user_id?: number;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: number | null;
  deleted_by_name?: string | null;
}

export interface CreateSalesUserPayload {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  assigned_projects?: string[];
  password: string;
  password_confirmation: string;
}

export interface UpdateSalesUserPayload {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  assigned_projects?: string[];
  is_active?: boolean;
  password?: string;
  password_confirmation?: string;
}

export const SalesUserAPI = {
  list: (search?: string) => {
    const params = search ? `?search=${encodeURIComponent(search)}` : "";
    return apiFetch<UserListResponse<SalesUser>>(`/sales-users${params}`);
  },

  get: (id: number) => apiFetch<{ data: SalesUser }>(`/sales-users/${id}`),

  create: (payload: CreateSalesUserPayload) =>
    apiFetch<{ message: string; data: SalesUser }>("/sales-users", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: number, payload: UpdateSalesUserPayload) =>
    apiFetch<{ message: string; data: SalesUser }>(`/sales-users/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  delete: (id: number) =>
    apiFetch<{ message: string }>(`/sales-users/${id}`, {
      method: "DELETE",
    }),

  restore: (id: number) =>
    apiFetch<{ message: string; data: SalesUser }>(
      `/sales-users/${id}/restore`,
      {
        method: "POST",
      },
    ),

  forceDelete: (id: number) =>
    apiFetch<{ message: string }>(`/sales-users/${id}/force-delete`, {
      method: "DELETE",
    }),
};

// ══════════════════════════════════════════════════════════════════════════════
//  CUSTOMER API
// ══════════════════════════════════════════════════════════════════════════════

export const CustomerAPI = {
  list: (companyId?: number) => {
    const params = companyId ? `?company_id=${companyId}` : "";
    return apiFetch<{ data: Customer[]; total: number }>(`/customers${params}`);
  },

  calendarList: () =>
    apiFetch<{ data: Customer[]; total: number }>("/customers/calendar"),

  upcoming: () => apiFetch<{ data: Customer[] }>("/customers/upcoming"),

  generateCode: () =>
    apiFetch<{ secret_code: string }>("/customers/generate-code", {
      method: "POST",
    }),

  create: (data: Partial<Customer>) =>
    apiFetch<{ message: string; data: Customer }>("/customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  update: (id: number, data: Partial<Customer>) =>
    apiFetch<{ message: string; data: Customer }>(`/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  delete: (id: number) =>
    apiFetch<{ message: string }>(`/customers/${id}`, {
      method: "DELETE",
    }),

  get: (id: number) => apiFetch<{ data: Customer }>(`/customers/${id}`),

  // Schedule meeting for a project (adds to projects array)
  scheduleMeeting: (
    customerId: number,
    data: {
      meeting_date: string;
      meeting_time: string;
      project_name: string;
      assigned_to_user_id?: number;
      session_link_id?: number;
    },
  ) =>
    apiFetch<{ message: string; data: Customer }>(
      `/customers/${customerId}/schedule-meeting`,
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  // Get all project meetings for a customer
  getProjectMeetings: (customerId: number) =>
    apiFetch<{
      data: {
        customer: string;
        projects: ProjectMeeting[];
        upcoming: ProjectMeeting[];
        completed: ProjectMeeting[];
      };
    }>(`/customers/${customerId}/project-meetings`),

  // Update a specific project meeting
  updateProjectMeeting: (
    customerId: number,
    projectName: string,
    data: {
      meeting_date: string;
      meeting_time: string;
      assigned_to_user_id?: number;
    },
  ) =>
    apiFetch<{ message: string; data: Customer }>(
      `/customers/${customerId}/project-meetings/${encodeURIComponent(projectName)}`,
      {
        method: "PUT",
        body: JSON.stringify(data),
      },
    ),

  // Delete a specific project meeting
  deleteProjectMeeting: (customerId: number, projectName: string) =>
    apiFetch<{ message: string; data: Customer }>(
      `/customers/${customerId}/project-meetings/${encodeURIComponent(projectName)}`,
      {
        method: "DELETE",
      },
    ),
};

export const CustomerProjectLinkAPI = {
  create: (data: {
    customer_id: number;
    selected_projects: LinkedProjectCard[];
  }) =>
    apiFetch<{ message: string; data: CustomerProjectLink }>(
      "/customer-project-links",
      {
        method: "POST",
        body: JSON.stringify(data),
      },
    ),

  byCustomer: (customerId: number) =>
    apiFetch<{ data: CustomerProjectLink[]; total: number }>(
      `/customer-project-links/customer/${customerId}`,
    ),

  removeSelectedProject: (linkId: number, projectTitle: string) =>
    apiFetch<{ message: string; data: CustomerProjectLink }>(
      `/customer-project-links/${linkId}/projects/${encodeURIComponent(projectTitle)}`,
      {
        method: "DELETE",
      },
    ),

  publicShow: (token: string) =>
    apiFetch<{ data: PublicCustomerProjectLink }>(
      `/public/customer-project-links/${token}`,
    ),

  publicLike: (
    token: string,
    liked_projects: LinkedProjectCard[],
    attempt_project_key?: string,
  ) =>
    apiFetch<{
      message: string;
      data: {
        id: number;
        status: string;
        liked_projects: LinkedProjectCard[];
        expires_at?: string;
        is_disabled?: boolean;
        max_attempts_per_card?: number;
        locked_project_keys?: string[];
      };
    }>(`/public/customer-project-links/${token}/like`, {
      method: "POST",
      body: JSON.stringify({ liked_projects, attempt_project_key }),
    }),

  publicUrl: (token: string) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const base =
      appUrl || (typeof window !== "undefined" ? window.location.origin : "");
    return `${base}/customer-link/${token}`;
  },
};

export const CustomerSessionLinkAPI = {
  list: () =>
    apiFetch<{ data: CustomerSessionLink[]; total: number }>(
      "/customer-session-links",
    ),

  statusSnapshots: () =>
    apiFetch<{ data: Record<string, CustomerSessionStatusSnapshot> }>(
      "/customer-session-links/status-snapshots",
    ),

  byCustomer: (customerId: number, projectName?: string) =>
    apiFetch<{ data: CustomerSessionLink[]; total: number }>(
      `/customer-session-links/customer/${customerId}${projectName?.trim() ? `?project_name=${encodeURIComponent(projectName.trim())}` : ""}`,
    ),

  create: (payload: CreateCustomerSessionLinkPayload) =>
    apiFetch<{ message: string; data: CustomerSessionLink }>(
      "/customer-session-links",
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          frontend_url:
            payload.frontend_url ||
            process.env.NEXT_PUBLIC_CONECTR_SESSION_FRONTEND_URL,
        }),
      },
    ),

  publicCreateSelfView: (
    token: string,
    payload: {
      project_key: string;
      project_name: string;
      presentation_id: string;
      viewer_name: string;
      viewer_email?: string;
      viewer_phone?: string;
      viewer_id?: string;
      meeting_date: string;
      meeting_time: string;
      expires_in_hours?: number;
      frontend_url?: string;
      calendar_visible?: boolean;
    },
  ) =>
    apiFetch<{
      message: string;
      data: CustomerSessionLink;
      already_exists?: boolean;
    }>(
      `/public/customer-project-links/${token}/self-view-session`,
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          frontend_url:
            payload.frontend_url ||
            process.env.NEXT_PUBLIC_CONECTR_SESSION_FRONTEND_URL ||
            process.env.NEXT_PUBLIC_CONECTR_SESSION_BASE_URL,
        }),
      },
    ),

  customerAnalytics: (customerId: number, developerId?: string) =>
    apiFetch<{ data: ConectrCustomerAnalyticsResponse }>(
      `/customer-session-links/customer/${customerId}/analytics${developerId?.trim() ? `?developer_id=${encodeURIComponent(developerId.trim())}` : ""}`,
    ),

  sessionAnalytics: (sessionLinkId: number) =>
    apiFetch<{ data: Record<string, unknown> }>(
      `/customer-session-links/${sessionLinkId}/analytics`,
    ),

  generateSessionSummary: (sessionLinkId: number) =>
    apiFetch<{ message: string; data?: Record<string, unknown> }>(
      `/customer-session-links/${sessionLinkId}/generate-summary`,
      { method: "POST" },
    ),

  endSession: (sessionLinkId: number) =>
    apiFetch<{ message: string }>(
      `/customer-session-links/${sessionLinkId}/end`,
      { method: "POST" },
    ),

  generateCustomerMasterSummary: (customerId: number) =>
    apiFetch<{ data: Record<string, unknown> }>(
      `/customer-session-links/customer/${customerId}/master-summary`,
      {
        method: "POST",
      },
    ),
};
// lib/api.ts - Add these lines

// ══════════════════════════════════════════════════════════════════════════════
//  PROJECT REQUEST API
// ══════════════════════════════════════════════════════════════════════════════

export interface ProjectRequest {
  id: number;
  user_id: number;
  developer_name: string;
  project_name?: string;
  manager_name: string;
  manager_phone: string;
  manager_email: string;
  status: "pending" | "contacted" | "activated" | "rejected";
  notes?: string;
  contacted_at?: string;
  activated_at?: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: number;
    name: string;
    email: string;
    company_name: string;
  };
}

export interface CreateProjectRequestPayload {
  developer_name: string;
  project_name?: string;
  manager_name: string;
  manager_phone: string;
  manager_email: string;
}

export const ProjectRequestAPI = {
  // Create new project request
  create: (payload: CreateProjectRequestPayload) =>
    apiFetch<{ message: string; data: ProjectRequest }>("/project-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Get user's own project requests
  getMyRequests: () =>
    apiFetch<{ data: ProjectRequest[]; total: number }>(
      "/project-requests/my-requests",
    ),

  // Get single project request
  get: (id: number) =>
    apiFetch<{ data: ProjectRequest }>(`/project-requests/${id}`),

  // Admin: Get all project requests
  adminList: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (search) params.set("search", search);
    const qs = params.toString() ? `?${params}` : "";
    return apiFetch<{ data: ProjectRequest[]; total: number }>(
      `/admin/project-requests${qs}`,
    );
  },

  // Admin: Update project request status
  adminUpdate: (id: number, payload: { status: string; notes?: string }) =>
    apiFetch<{ message: string; data: ProjectRequest }>(
      `/admin/project-requests/${id}`,
      {
        method: "PUT",
        body: JSON.stringify(payload),
      },
    ),
};

// ══════════════════════════════════════════════════════════════════════════════
//  ACTIVATION REQUEST API
// ══════════════════════════════════════════════════════════════════════════════

export interface ActivationRequestPayload {
  project_name: string;
  city: string;
  google_location: string;
  units_left_label: string;
  units_left: number;
  possession_date: string;
  price_range: string;
  location_type: string;
  unit_structure: string;
  buyer_type: string;
  sales_velocity: string;
  target_timeline: string;
  developer_positioning: string;
  contact_name: string;
  designation: string;
  phone: string;
  email: string;
  developer_name: string;
  assessment: string | null;
  submitted_at: string;
}

export interface ActivationRequestResponse {
  message: string;
  data: {
    id: number;
    project_name: string;
    city: string;
    status: string;
    created_at: string;
  };
}

export interface ActivationApprovalProject {
  id: number;
  project_name: string;
  developer_name: string;
  city: string;
  unit_structure?: string | null;
  price_range?: string | null;
  units_left?: number;
  approval_count?: number;
  my_approval_attempts?: number;
  status: string;
  created_at: string;
}

export const ActivationRequestAPI = {
  create: (payload: ActivationRequestPayload, token?: string | null) =>
    apiFetch<ActivationRequestResponse>("/activation-requests", {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: JSON.stringify(payload),
    }),

  getMyProjects: () =>
    apiFetch<{ data: ActivationApprovalProject[]; total: number }>(
      "/activation-requests/my-projects",
    ),

  approve: (id: number) =>
    apiFetch<{ message: string; data: ActivationApprovalProject }>(
      `/activation-requests/${id}/approve`,
      {
        method: "POST",
      },
    ),
};

// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════

// End of API definitions.
