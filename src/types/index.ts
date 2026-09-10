// MediVerify AI - Domain Types & Backend Alignment

export type Role = 'super_admin' | 'admin' | 'compliance_officer' | 'hr' | 'clinician';

export type CredentialStatus =
  | 'pending_verification'
  | 'verified'
  | 'mismatch'
  | 'expired'
  | 'rejected';

export type AuthorityStatus =
  | 'unchecked'
  | 'active'
  | 'expired'
  | 'suspended'
  | 'revoked'
  | 'not_found';

export type CredentialType =
  | 'rn_license'
  | 'md_license'
  | 'dea_registration'
  | 'bls'
  | 'acls'
  | 'hipaa_training'
  | 'vaccination'
  | 'other';

export type ReportStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'sent'
  | 'rejected';

export type CheckType =
  | 'ocr_quality'
  | 'face_match'
  | 'signature_detection'
  | 'tamper_detection'
  | 'field_completeness'
  | 'type_match';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  organizationName: string;
  orgId?: string;
  clinicianId?: string;
}

export interface Credential {
  id: string;
  clinicianId: string;
  type: CredentialType;
  title: string;
  identifier: string;
  status: CredentialStatus;
  authorityStatus: AuthorityStatus;
  issuedOn: string;
  expiresOn: string;
  source: 'government_registry' | 'document_extraction' | 'manual_verification';
  registryName?: string;
  documentFileName?: string;
  confidenceScore?: number;
  lastChecked: string;
}

export interface Clinician {
  id: string;
  name: string;
  roleTitle: string; // e.g. "Nurse (RN)", "Physician (MD)"
  clinicalRole: 'Nurse' | 'Physician' | 'Nurse Practitioner' | 'Physician Assistant';
  department: string;
  facility: string;
  complianceStatus: 'compliant' | 'expiring' | 'non_compliant';
  credentialsDue: string;
  lastChecked: string;
  credentials: Credential[];
  initials: string;
}

export interface DocumentCheck {
  id: string;
  clinicianId: string;
  clinicianName: string;
  documentName: string;
  documentType: CredentialType;
  checkType: CheckType;
  aiFinding: string;
  confidenceScore: number;
  submittedAgo: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface Citation {
  title: string;
  sourceType: 'Registry' | 'Policy' | 'Memory' | 'Document';
  uri?: string;
  /** Raw backend "source" field, e.g. "policy:RN License", "ocr:extract_document". */
  source?: string;
  /** chunk_id / policy_document_id / job_id / fetched_at, depending on citation kind. */
  reference?: string;
  /** 0-1 relevance/confidence score, present on RAG/OCR/connector citations. */
  confidence?: number;
  /** Explanatory or excerpt text, present on registry & compliance-finding citations. */
  text?: string;
  /** source_chunk_id, present on compliance-finding citations. */
  chunkId?: string;
  /** Present on registry/authority citations when the source data is stale/degraded. */
  degraded?: boolean;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  reasoningPath?: string;
  reportCard?: {
    id: string;
    title: string;
    type: string;
    generatedAgo: string;
    status: ReportStatus;
  };
}

export interface Conversation {
  id: string;
  title: string;
  updatedAgo: string;
  messages: ChatMessage[];
}

export interface ComplianceReport {
  id: string;
  title: string;
  scope: 'Clinician' | 'Organization';
  clinicianName?: string;
  status: ReportStatus;
  generatedDate: string;
  aiModel: string;
  executiveSummary: string;
  credentialAuditTable: {
    requirement: string;
    status: 'Compliant' | 'Expiring Soon' | 'Expired';
    validUntil: string;
  }[];
  gapsIdentified: {
    title: string;
    description: string;
    citation: string;
  }[];
  recommendedActions: string[];
  reviewNotes?: string;
}

export interface OrganizationOnboardData {
  orgName: string;
  orgEmail: string;
  phone?: string;
  noOfEmployees: number;
  adminName: string;
  adminEmail: string;
}
