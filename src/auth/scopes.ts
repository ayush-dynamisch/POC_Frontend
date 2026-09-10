// Mirror of ROLE_SCOPES in the backend's app/d5_security/scopes.py.
//
// The backend is the only enforcer; this exists so the UI stops offering actions
// it will refuse. When the two disagree, scopes.py wins — update this file.
//
// Only the scopes some UI surface actually gates are listed. The rest of the
// backend table (users:update/delete, credentials:manage, compliance:run,
// documents:delete, organizations:*) has no route and no UI, so it has no
// business here either.
import type { Role } from "../types";

export type Scope =
  | "users:create"
  | "documents:update"
  | "credentials:verify"
  | "compliance:read"
  | "compliance:report"
  | "audit_logs:read";

const ROLE_SCOPES: Record<Role, Scope[]> = {
  super_admin: ["audit_logs:read"],
  admin: [
    "users:create",
    "documents:update",
    "credentials:verify",
    "compliance:read",
    "compliance:report",
    "audit_logs:read",
  ],
  compliance_officer: [
    "documents:update",
    "credentials:verify",
    "compliance:read",
    "compliance:report",
    "audit_logs:read",
  ],
  // users:create is granted in scopes.py but POST /organizations/{id}/users
  // rejects HR outright, so HR may add clinicians and not staff users.
  hr: [
    "users:create",
    "documents:update",
    "credentials:verify",
    "compliance:read",
  ],
  clinician: ["compliance:read"],
};

export const hasScope = (role: Role | undefined, scope: Scope): boolean =>
  !!role && ROLE_SCOPES[role].includes(scope);
