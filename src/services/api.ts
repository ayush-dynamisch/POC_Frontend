// MediVerify AI - Real Backend API Service Client

import type { ChatStreamEvent } from "../types/events";
import { isTerminalEvent } from "../types/events";

const API_BASE = "";

// ── Token-refresh infrastructure ──────────────────────────────────────────────
// Module-level lock so concurrent 401s trigger only one /auth/refresh call.
let _refreshPromise: Promise<LoginResult> | null = null;

/** True when the stored access-token expires within the next 60 seconds. */
function isTokenExpiringSoon(): boolean {
  const expiry = localStorage.getItem("mediverify_token_expiry");
  if (!expiry) return false;
  return Date.now() > Number(expiry) - 60_000; // 60-second buffer
}

/** Endpoints that must never trigger a token refresh (avoid infinite loops). */
const NO_REFRESH_ENDPOINTS = ["/auth/login", "/auth/refresh"];

// Thrown by apiFetch on a non-ok response. Behaves like a plain Error
// (`.message` still works for every existing `catch (err: any) { err.message }`
// call site) but also carries the HTTP status so new code can distinguish,
// e.g., a 409 conflict from other failures without string-matching on text.
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem("mediverify_token");
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export async function apiFetch<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const canRefresh = !NO_REFRESH_ENDPOINTS.includes(endpoint);

  // ── Proactive refresh: if the token is about to expire, refresh first ──
  if (canRefresh && isTokenExpiringSoon()) {
    if (!_refreshPromise) {
      _refreshPromise = authApi.refresh().finally(() => {
        _refreshPromise = null;
      });
    }
    try {
      await _refreshPromise;
    } catch {
      // If proactive refresh fails, proceed anyway — the 401 interceptor
      // below will catch the actual failure and handle it.
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
    ...((options.headers as Record<string, string>) || {}),
  };

  // If body is FormData, delete Content-Type so browser sets boundary multipart
  if (options.body instanceof FormData) {
    delete headers["Content-Type"];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

  // ── 401 Interceptor: attempt silent token refresh & retry ───────────────
  if (response.status === 401 && canRefresh) {
    // Deduplicate: if a refresh is already in-flight, wait for it
    if (!_refreshPromise) {
      _refreshPromise = authApi.refresh().finally(() => {
        _refreshPromise = null;
      });
    }

    try {
      await _refreshPromise;
      // Retry the original request with the fresh token
      return apiFetch<T>(endpoint, options);
    } catch {
      // Refresh itself failed — session is dead
      window.dispatchEvent(new CustomEvent("auth:expired"));
      throw new ApiError("Session expired. Please log in again.", 401);
    }
  }

  if (!response.ok) {
    let errorMsg = `API Error ${response.status}: ${response.statusText}`;
    try {
      const errJson = await response.json();
      if (typeof errJson.detail === "string") {
        errorMsg = errJson.detail;
      } else if (typeof errJson.message === "string") {
        errorMsg = errJson.message;
      } else if (errJson.detail && typeof errJson.detail === "object") {
        errorMsg =
          errJson.detail.detail ||
          errJson.detail.message ||
          JSON.stringify(errJson.detail);
      } else if (errJson.message && typeof errJson.message === "object") {
        errorMsg = JSON.stringify(errJson.message);
      }
    } catch {
      // Ignore json parse error
    }
    throw new ApiError(
      typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
      response.status,
    );
  }

  // Handle empty 204
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

// 1. Authentication Service
export interface LoginAccount {
  account_type: "admin" | "user";
  user_id: string;
  email: string;
  role: string;
  org_id: string | null;
  name: string | null;
  org_name: string | null;
}

export interface LoginResult {
  account: LoginAccount;
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export const authApi = {
  async login(email: string, password: string): Promise<LoginResult> {
    const data = await apiFetch<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem("mediverify_token", data.access_token);
    localStorage.setItem("mediverify_account", JSON.stringify(data.account));
    // Store refresh-token & computed expiry so we can silently renew later
    if (data.refresh_token) {
      localStorage.setItem("mediverify_refresh_token", data.refresh_token);
    }
    localStorage.setItem(
      "mediverify_token_expiry",
      String(Date.now() + (data.expires_in || 3600) * 1000),
    );
    return data;
  },

  logout() {
    localStorage.removeItem("mediverify_token");
    localStorage.removeItem("mediverify_account");
    localStorage.removeItem("mediverify_refresh_token");
    localStorage.removeItem("mediverify_token_expiry");
  },

  /** Exchange the stored refresh-token for a new access-token pair. */
  async refresh(): Promise<LoginResult> {
    const refreshToken = localStorage.getItem("mediverify_refresh_token");
    if (!refreshToken) {
      throw new ApiError("No refresh token available", 401);
    }

    // Use raw fetch to avoid triggering our own 401 interceptor
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
      credentials: "include",
    });

    if (!response.ok) {
      // Refresh token is also expired / invalid — clear everything
      authApi.logout();
      throw new ApiError("Refresh token expired", response.status);
    }

    const data: LoginResult = await response.json();

    // Persist the rotated tokens
    localStorage.setItem("mediverify_token", data.access_token);
    if (data.refresh_token) {
      localStorage.setItem("mediverify_refresh_token", data.refresh_token);
    }
    localStorage.setItem(
      "mediverify_token_expiry",
      String(Date.now() + (data.expires_in || 3600) * 1000),
    );
    if (data.account) {
      localStorage.setItem("mediverify_account", JSON.stringify(data.account));
    }
    return data;
  },

  getStoredAccount(): LoginAccount | null {
    const stored = localStorage.getItem("mediverify_account");
    if (!stored) return null;
    try {
      return JSON.parse(stored);
    } catch {
      return null;
    }
  },
};

// 2. Dashboard Service
export interface DashboardResponse {
  organization_id: string;
  clinicians: {
    clinician_id: string;
    full_name: string;
    role: string;
    is_active: boolean | null;
    jurisdiction: string | null;
    summary: {
      compliant: boolean;
      counts_by_state: Record<string, number>;
      mandatory_gaps: number;
      gaps: any[];
      total_requirements: number;
    };
  }[];
  counts_by_state: Record<string, number>;
  totals: {
    clinicians: number;
    compliant: number;
    non_compliant: number;
  };
  evaluated_on: string;
}

export const dashboardApi = {
  async getDashboard(orgId: string): Promise<DashboardResponse> {
    return apiFetch<DashboardResponse>(`/orgs/${orgId}/dashboard`);
  },
};

// 3. Clinician Compliance Service
export interface ClinicianComplianceStatus {
  clinician: {
    id: string;
    full_name: string;
    role: string;
    jurisdiction: string | null;
  };
  findings: {
    requirement_id?: string;
    credential_id?: string;
    credential_type?: string;
    title?: string;
    identifier?: string;
    status?: string;
    state?: string;
    reason?: string | { code?: string; detail?: string };
    authority_status?: string;
    expires_on?: string;
    source?: string;
    confidence_score?: number;
    is_mandatory?: boolean;
    citation_text?: string;
  }[];
  summary: {
    compliant: boolean;
    counts_by_state: Record<string, number>;
    mandatory_gaps: number;
    gaps: any[];
    total_requirements: number;
  };
}

export const cliniciansApi = {
  async getComplianceStatus(
    clinicianId: string,
  ): Promise<ClinicianComplianceStatus> {
    return apiFetch<ClinicianComplianceStatus>(
      `/clinicians/${clinicianId}/compliance-status`,
    );
  },

  async listClinicians(orgId: string): Promise<any[]> {
    try {
      const res = await dashboardApi.getDashboard(orgId);
      return res.clinicians || [];
    } catch {
      return [];
    }
  },
};

// 4. Credentials Service
// GET /credentials/{id} and POST /credentials/{id}/reverify have no backend
// Pydantic schema (ad hoc dicts) — these types are hand-derived from the route source.
export interface VerificationRecord {
  id: string;
  outcome: "match" | "mismatch" | "expired" | "not_found" | "unverifiable";
  mismatches: {
    fields?: {
      field: string;
      document: string;
      authority?: string;
      clinician?: string;
      source: "authority" | "clinician_record";
    }[];
    policy?: {
      reason: string;
      authority_status_raw?: string;
      disallowed?: string[];
    };
    narrative?: string;
    manual_review?: {
      decision: string;
      reviewed_by: string;
      reviewed_at: string;
      note?: string | null;
      previous_status: string;
    };
  } | null;
  created_at: string;
}

export interface ExternalVerificationRecord {
  id: string;
  source: string;
  authority_status: string;
  authority_status_raw: string | null;
  degraded: boolean;
  fetched_at: string;
}

export interface CredentialDetail {
  id: string;
  credential_type: string;
  status: string;
  authority_status: string;
  authority_checked_at: string | null;
  identifier: string | null;
  holder_name: string | null;
  jurisdiction: string | null;
  issued_on: string | null;
  expires_on: string | null;
  effective_expires_on: string | null;
  verifications: VerificationRecord[];
  external_verifications: ExternalVerificationRecord[];
}

export const credentialsApi = {
  async getCredential(credentialId: string): Promise<CredentialDetail> {
    return apiFetch<CredentialDetail>(`/credentials/${credentialId}`);
  },

  async reverify(credentialId: string): Promise<any> {
    return apiFetch<any>(`/credentials/${credentialId}/reverify`, {
      method: "POST",
    });
  },

  // Reverify can resolve inline (full credential shape + job_id) or kick off a
  // background job ({job_id, credential_id, status:"verifying"}) depending on
  // backend config. Either way, the job's own completion payload is
  // deliberately PHI-stripped, so we always finish with a fresh GET rather
  // than trusting its contents.
  async reverifyAndRefresh(credentialId: string): Promise<CredentialDetail> {
    const res = await credentialsApi.reverify(credentialId);
    if (res?.status === "verifying" && res?.job_id) {
      await jobsApi.streamJob(res.job_id, { onEvent: () => {} });
    }
    return credentialsApi.getCredential(credentialId);
  },

  async review(
    credentialId: string,
    decision: "approve" | "reject" | "approved" | "rejected",
    note?: string,
  ): Promise<any> {
    const normalizedDecision =
      decision === "approved"
        ? "approve"
        : decision === "rejected"
          ? "reject"
          : decision;
    return apiFetch<any>(`/credentials/${credentialId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision: normalizedDecision, note }),
    });
  },
};

// 5. Documents & AI Review Queue Service
export interface ReviewQueueCheck {
  id: string;
  clinician_id?: string;
  clinician_name?: string;
  document_id?: string;
  document_name?: string;
  check_type: string;
  ai_finding?: string;
  finding?: string;
  score?: number;
  confidence_score?: number;
  created_at?: string;
  submitted_ago?: string;
}

// GET /documents/{id} has no backend Pydantic response_model export beyond
// the route's own DocumentDetailResponse — typed by hand here to match it.
export interface DocumentCheckSummary {
  id: string;
  check_type: string;
  passed: boolean | null;
  confidence: number | null;
  review_status: "not_required" | "pending" | "approved" | "rejected";
  details: Record<string, any> | null;
}

export interface DocumentCredentialSummary {
  id: string;
  credential_type: string;
  status: string;
  identifier: string | null;
  holder_name: string | null;
  jurisdiction: string | null;
  issued_on: string | null;
  expires_on: string | null;
  effective_expires_on: string | null;
}

export interface DocumentDetail {
  id: string;
  status: string;
  document_type: string;
  credential_type: string | null;
  ocr: {
    // Note: raw_text and ocr_job_id live nested inside extracted_fields on
    // the backend, not as siblings — mirrored here rather than flattened,
    // since flattening would silently diverge from the real response shape.
    extracted_fields: {
      fields?: Record<string, any>;
      raw_text?: string;
      ocr_job_id?: string;
    } | null;
    confidence: number | null;
    model: string | null;
  } | null;
  checks: DocumentCheckSummary[];
  credential: DocumentCredentialSummary | null;
}

export const documentsApi = {
  async upload(
    clinicianId: string,
    file: File,
    credentialType?: string,
  ): Promise<any> {
    const formData = new FormData();
    formData.append("clinician_id", clinicianId);
    formData.append("file", file);
    if (credentialType) {
      formData.append("credential_type", credentialType);
    }
    return apiFetch<any>("/documents/upload", {
      method: "POST",
      body: formData,
    });
  },

  async getReviewQueue(
    limit = 50,
    offset = 0,
  ): Promise<{
    checks: ReviewQueueCheck[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    return apiFetch(
      `/document-checks/review-queue?limit=${limit}&offset=${offset}`,
    );
  },

  async getDocument(documentId: string): Promise<DocumentDetail> {
    return apiFetch<DocumentDetail>(`/documents/${documentId}`);
  },

  // Backend schema is Literal["approve", "reject"] (app/api/schemas/document.py).
  async reviewCheck(
    checkId: string,
    decision: "approve" | "reject",
    note?: string,
  ): Promise<any> {
    return apiFetch(`/document-checks/${checkId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
  },
};

// 6. AI Compliance Chat Service
export interface BackendConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  messages_count?: number;
}

export interface BackendChatMessage {
  id: string;
  role: string;
  content: string;
  citations: any[];
  agent_run_id: string | null;
  created_at: string;
}

export interface BackendConversationDetail {
  session_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  salient_entities: Record<string, any>;
  messages: BackendChatMessage[];
  limit: number;
  offset: number;
  has_more: boolean;
}

export const chatApi = {
  async listConversations(
    limit = 50,
    offset = 0,
  ): Promise<{
    conversations: BackendConversation[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    return apiFetch(`/chat/conversations?limit=${limit}&offset=${offset}`);
  },

  async createConversation(
    title?: string,
  ): Promise<{ session_id: string; title: string }> {
    return apiFetch("/chat/conversations", {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  },

  async loadConversation(
    sessionId: string,
  ): Promise<BackendConversationDetail> {
    return apiFetch(`/chat/conversations/${sessionId}`);
  },

  async sendMessage(message: string, sessionId?: string): Promise<any> {
    return apiFetch("/chat", {
      method: "POST",
      body: JSON.stringify({ message, session_id: sessionId }),
    });
  },

  async getStatus(jobId: string): Promise<any> {
    return apiFetch(`/chat/status/${jobId}`);
  },

  // Consumes GET /chat/stream/{jobId} (text/event-stream) until a terminal
  // event (complete/error/awaiting_approval) arrives. Uses fetch + a manual
  // reader instead of EventSource so the same Authorization header used by
  // every other call still applies (EventSource can't set custom headers).
  async streamJob(
    jobId: string,
    {
      onEvent,
      signal,
    }: { onEvent: (evt: ChatStreamEvent) => void; signal?: AbortSignal },
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/chat/stream/${jobId}`, {
      method: "GET",
      headers: {
        ...getAuthHeader(),
        Accept: "text/event-stream",
      },
      credentials: "include",
      signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(
        `Stream failed: ${response.status} ${response.statusText}`,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);

        const dataLines = rawFrame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim());

        if (dataLines.length === 0) continue; // heartbeat comment frame (": ping")

        try {
          const evt = JSON.parse(dataLines.join("\n")) as ChatStreamEvent;
          onEvent(evt);
          if (isTerminalEvent(evt)) return;
        } catch (e) {
          console.error(
            "Failed to parse SSE frame from /chat/stream:",
            dataLines.join("\n"),
            e,
          );
        }
      }
    }
  },
};

// 7. Reports Service
export interface BackendReport {
  // The list endpoint (GET /reports) and the detail endpoint (GET /reports/{id})
  // don't share one response_model on the backend — the detail response actually
  // comes back as { report_id, status, scope, clinician_id, format, text, meta },
  // with no `id`/`title`/`body`/`summary`. Both id fields and both body fields
  // are kept optional here so either shape is handled without runtime errors.
  id?: string;
  report_id?: string;
  title?: string;
  scope: string;
  status: string;
  clinician_id?: string;
  organization_id?: string;
  created_at?: string;
  format?: string;
  text?: string;
  body?: string;
  summary?: string;
  approved_by?: string;
  approved_at?: string;
}

export const reportsApi = {
  async listReports(
    status?: string,
    scope?: string,
    clinicianId?: string,
  ): Promise<{
    reports: BackendReport[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (scope) params.append("scope", scope);
    if (clinicianId) params.append("clinician_id", clinicianId);
    return apiFetch(`/reports?${params.toString()}`);
  },

  async getReport(reportId: string): Promise<BackendReport> {
    return apiFetch<BackendReport>(`/reports/${reportId}`);
  },

  async approveReport(reportId: string, note?: string): Promise<any> {
    return apiFetch<any>(`/reports/${reportId}/approve`, {
      method: "POST",
      body: JSON.stringify({ note }),
    });
  },
};

// 8. Super Admin Organization Onboarding Service
export interface OnboardOrgPayload {
  name: string;
  email: string;
  phone?: string;
  no_of_employees: number;
  admin_name: string;
  admin_email: string;
}

export interface OnboardOrgResponse {
  org_id: string;
  name: string;
  admin_email: string;
  created_at: string;
  status: string;
  password: string;
}

export const adminApi = {
  async onboardOrg(payload: OnboardOrgPayload): Promise<OnboardOrgResponse> {
    return apiFetch<OnboardOrgResponse>("/admin/onboardOrg", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

// 9. Policy Documents Service (D1 RAG ingestion — separate from clinician
// credential documents above)
export interface PolicySummary {
  id: string;
  title: string;
  status: "draft" | "published" | "superseded";
  jurisdiction: string | null;
  version: string | null;
  mime_type: string;
  allowed_roles: string[];
  supersedes_policy_document_id: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface ProposedRequirement {
  id: string;
  credential_type: string;
  role: string;
  jurisdiction: string | null;
  is_mandatory: boolean;
  renewal_months: number | null;
  grace_period_days: number | null;
  disallowed_authority_statuses: string[];
  citation_text: string;
  source_chunk_id: string;
  extractor_confidence: number;
  status: "pending" | "active" | "rejected";
}

export interface PolicyReview {
  policy_document_id: string;
  title: string;
  status: string;
  requirements: ProposedRequirement[];
}

export interface PolicyUploadResult {
  job_id: string;
  policy_document_id: string;
  status: string;
}

export const policiesApi = {
  async upload(
    title: string,
    file: File,
    opts?: { jurisdiction?: string; version?: string; allowedRoles?: string[] },
  ): Promise<PolicyUploadResult> {
    const formData = new FormData();
    formData.append("title", title);
    formData.append("file", file);
    if (opts?.jurisdiction) formData.append("jurisdiction", opts.jurisdiction);
    if (opts?.version) formData.append("version", opts.version);
    if (opts?.allowedRoles && opts.allowedRoles.length > 0) {
      formData.append("allowed_roles", opts.allowedRoles.join(","));
    }
    return apiFetch<PolicyUploadResult>("/policies/upload", {
      method: "POST",
      body: formData,
    });
  },

  async list(
    status?: string,
    limit = 50,
    offset = 0,
  ): Promise<{
    documents: PolicySummary[];
    limit: number;
    offset: number;
    has_more: boolean;
  }> {
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    params.append("limit", String(limit));
    params.append("offset", String(offset));
    return apiFetch(`/policies?${params.toString()}`);
  },

  async getReview(policyDocumentId: string): Promise<PolicyReview> {
    return apiFetch<PolicyReview>(`/policies/${policyDocumentId}/review`);
  },

  async publish(
    policyDocumentId: string,
    payload: {
      accept?: string[];
      acceptAll?: boolean;
      replaceExisting?: boolean;
    },
  ): Promise<any> {
    return apiFetch<any>(`/policies/${policyDocumentId}/publish`, {
      method: "POST",
      body: JSON.stringify({
        accept: payload.accept || [],
        accept_all: !!payload.acceptAll,
        replace_existing: !!payload.replaceExisting,
      }),
    });
  },

  async supersede(policyDocumentId: string): Promise<any> {
    return apiFetch<any>(`/policies/${policyDocumentId}`, {
      method: "DELETE",
    });
  },
};

// 10. Team Provisioning Service (add clinicians / add staff users)
export interface ClinicianCreateInput {
  full_name: string;
  clinical_role:
    | "nurse"
    | "physician"
    | "technician"
    | "therapist"
    | "pharmacist"
    | "other";
  jurisdiction?: string;
  npi?: string;
  email?: string;
}

export interface ClinicianCreateResult {
  clinician_id: string;
  user_id: string;
  email: string;
  password: string;
  status: string;
}

export interface StaffUserCreateInput {
  email: string;
  full_name: string;
  role: "hr" | "compliance_officer";
}

export interface StaffUserCreateResult {
  email: string;
  user_id: string;
  password: string;
  status: string;
}

export const teamApi = {
  async addClinicians(
    orgId: string,
    clinicians: ClinicianCreateInput[],
  ): Promise<ClinicianCreateResult[]> {
    return apiFetch<ClinicianCreateResult[]>(
      `/organizations/${orgId}/clinicians`,
      {
        method: "POST",
        body: JSON.stringify({ clinicians }),
      },
    );
  },

  async addUsers(
    orgId: string,
    users: StaffUserCreateInput[],
  ): Promise<StaffUserCreateResult[]> {
    return apiFetch<StaffUserCreateResult[]>(`/organizations/${orgId}/users`, {
      method: "POST",
      body: JSON.stringify({ users }),
    });
  },

  // One-shot "invite this clinician to the self-service portal" action — not a
  // toggle. Throws an ApiError with status 409 if the clinician already has a
  // login; there is no revoke/deactivate endpoint on the backend.
  async grantClinicianAccess(
    orgId: string,
    clinicianId: string,
    email?: string,
  ): Promise<ClinicianCreateResult> {
    return apiFetch<ClinicianCreateResult>(
      `/organizations/${orgId}/clinicians/${clinicianId}/grant-access`,
      {
        method: "POST",
        body: JSON.stringify({ email: email || undefined }),
      },
    );
  },
};

// 11. Cost Management Service (Platform Super Admin)
// Backed by GET /agent-runs, which is gated on the `audit_logs:read` scope —
// the one data-plane scope a super_admin holds. An admin account has no
// organization of its own, so omitting `org_id` returns the unfiltered
// cross-org feed. That is the platform-wide spend view.

// The `usage` JSONB written by app/core/usage.py. Money is always
// `str(Decimal)` and never a float: a Numeric(12,6) that round-trips through a
// JS number is a Numeric(12,6) you can no longer trust. `null` means the model
// had no published price, NOT that the call was free.
export interface AgentRunUsageBucket {
  input: number;
  output: number;
  cost_usd: string | null;
  calls: number;
}

export interface AgentRunUsage {
  total: {
    tokens: number;
    input: number;
    output: number;
    cost_usd: string | null;
    calls: number;
    latency_ms?: number;
  };
  by_model: Record<string, AgentRunUsageBucket>;
  // `latency_ms` here is the agent's own turn. Spans nest, so these do not sum
  // to the turn's wall clock — see app/core/usage.py.
  by_agent: Record<
    string,
    {
      tokens: number;
      cost_usd: string | null;
      latency_ms: number;
      calls: number;
      runs: number;
    }
  >;
}

export interface AgentRunRow {
  id: string;
  organization_id: string;
  // Outer-joined, so null when a run outlives its organization.
  organization_name: string | null;
  domain: string;
  agent_name: string;
  status: string;
  tokens: number | null;
  cost_usd: string | null;
  latency_ms: number | null;
  // Null for rows written before the column existed, which every historical
  // row is. Totals still work from `cost_usd`; only the breakdown is missing.
  usage: AgentRunUsage | null;
  created_at: string;
}

export interface AgentRunsResponse {
  runs: AgentRunRow[];
  limit: number;
  offset: number;
  has_more: boolean;
}

// GET /agent-runs/summary — the roll-up, done in SQL. Totals over a range
// three ways: by organization (from the row columns) and by model / by agent
// (summed inside the `usage` JSONB). Unbounded when since/until are omitted,
// so "everything so far" is one request.
export interface CostByOrg {
  organization_id: string;
  organization_name: string | null;
  runs: number;
  tokens: number;
  cost_usd: string;
}

export interface CostByModel {
  model: string;
  calls: number;
  input: number;
  output: number;
  cost_usd: string;
}

export interface CostByAgent {
  agent: string;
  calls: number;
  runs: number;
  tokens: number;
  latency_ms: number;
  cost_usd: string;
}

export interface AgentRunsSummary {
  since: string | null;
  until: string | null;
  total: { runs: number; tokens: number; cost_usd: string };
  by_org: CostByOrg[];
  by_model: CostByModel[];
  by_agent: CostByAgent[];
  // Non-empty means every money figure above is an undercount: these models
  // have no published price, so they contributed tokens but no dollars.
  unpriced_models: string[];
}

// The row feed hard-caps `limit` at 50 server-side. We only ever want one page
// of it — the totals come from /summary, not from walking this.
const AGENT_RUNS_PAGE = 50;

export const costApi = {
  async getSummary(params: {
    since?: string;
    until?: string;
    orgId?: string;
  }): Promise<AgentRunsSummary> {
    const query = new URLSearchParams();
    if (params.since) query.append("since", params.since);
    if (params.until) query.append("until", params.until);
    if (params.orgId) query.append("org_id", params.orgId);
    const qs = query.toString();
    return apiFetch<AgentRunsSummary>(
      `/agent-runs/summary${qs ? `?${qs}` : ""}`,
    );
  },

  async listAgentRuns(params: {
    since?: string;
    until?: string;
    domain?: string;
    orgId?: string;
    offset?: number;
  }): Promise<AgentRunsResponse> {
    const query = new URLSearchParams({ limit: String(AGENT_RUNS_PAGE) });
    if (params.since) query.append("since", params.since);
    if (params.until) query.append("until", params.until);
    if (params.domain) query.append("domain", params.domain);
    if (params.orgId) query.append("org_id", params.orgId);
    if (params.offset) query.append("offset", String(params.offset));
    return apiFetch<AgentRunsResponse>(`/agent-runs?${query.toString()}`);
  },
};

// Generic async-job SSE/polling helpers. The backend's job endpoints
// (GET /chat/stream/{jobId}, GET /chat/status/{jobId}) are Redis-backed and
// domain-agnostic — any job_id, chat or policy ingestion, streams through the
// same mechanism. Aliased here so non-chat features don't reach into `chatApi`.
export const jobsApi = {
  streamJob: chatApi.streamJob,
  getStatus: chatApi.getStatus,
};
