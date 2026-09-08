// MediVerify AI - Real Backend API Service Client

import type { ChatStreamEvent } from "../types/events";
import { isTerminalEvent } from "../types/events";

const API_BASE = "";

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
  const headers = {
    "Content-Type": "application/json",
    ...getAuthHeader(),
    ...(options.headers || {}),
  };

  // If body is FormData, delete Content-Type so browser sets boundary multipart
  if (options.body instanceof FormData) {
    delete (headers as Record<string, string>)["Content-Type"];
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
  });

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
    throw new Error(
      typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
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
    return data;
  },

  logout() {
    localStorage.removeItem("mediverify_token");
    localStorage.removeItem("mediverify_account");
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
export const credentialsApi = {
  async reverify(credentialId: string): Promise<any> {
    return apiFetch<any>(`/credentials/${credentialId}/reverify`, {
      method: "POST",
    });
  },

  async review(
    credentialId: string,
    decision: "approved" | "rejected",
    note?: string,
  ): Promise<any> {
    return apiFetch<any>(`/credentials/${credentialId}/review`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
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

  async reviewCheck(
    checkId: string,
    decision: "approve" | "rejected",
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
  id: string;
  title: string;
  scope: string;
  status: string;
  clinician_id?: string;
  organization_id?: string;
  created_at: string;
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
};

// Generic async-job SSE/polling helpers. The backend's job endpoints
// (GET /chat/stream/{jobId}, GET /chat/status/{jobId}) are Redis-backed and
// domain-agnostic — any job_id, chat or policy ingestion, streams through the
// same mechanism. Aliased here so non-chat features don't reach into `chatApi`.
export const jobsApi = {
  streamJob: chatApi.streamJob,
  getStatus: chatApi.getStatus,
};
