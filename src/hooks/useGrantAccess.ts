import { useCallback, useState } from "react";
import { ApiError, teamApi, type ClinicianCreateResult } from "../services/api";

export type GrantAccessStatus =
  | "idle"
  | "pending"
  | "granted"
  | "already_granted"
  | "error";

interface UseGrantAccessResult {
  /** Current status for a given clinician id (defaults to 'idle' if unknown). */
  statusFor: (clinicianId: string) => GrantAccessStatus;
  /** Error message for a given clinician id, if its status is 'error'. */
  errorFor: (clinicianId: string) => string | null;
  /** Kicks off the one-shot grant-access call for a clinician. */
  grant: (orgId: string, clinicianId: string, email?: string) => Promise<void>;
  /** Credentials from the most recently successful grant, for a shared confirmation modal. */
  credentials: ClinicianCreateResult | null;
  /** Dismiss the credentials modal. */
  clearCredentials: () => void;
}

export function useGrantAccess(): UseGrantAccessResult {
  const [statusMap, setStatusMap] = useState<Record<string, GrantAccessStatus>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<ClinicianCreateResult | null>(null);

  const statusFor = useCallback(
    (clinicianId: string) => statusMap[clinicianId] || "idle",
    [statusMap]
  );

  const errorFor = useCallback(
    (clinicianId: string) => errorMap[clinicianId] || null,
    [errorMap]
  );

  const grant = useCallback(async (orgId: string, clinicianId: string, email?: string) => {
    setStatusMap((prev) => ({ ...prev, [clinicianId]: "pending" }));
    setErrorMap((prev) => {
      const next = { ...prev };
      delete next[clinicianId];
      return next;
    });

    try {
      const result = await teamApi.grantClinicianAccess(orgId, clinicianId, email);
      setStatusMap((prev) => ({ ...prev, [clinicianId]: "granted" }));
      setCredentials(result);
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 409) {
        setStatusMap((prev) => ({ ...prev, [clinicianId]: "already_granted" }));
      } else {
        setStatusMap((prev) => ({ ...prev, [clinicianId]: "error" }));
        setErrorMap((prev) => ({ ...prev, [clinicianId]: err.message || "Failed to grant access" }));
      }
    }
  }, []);

  const clearCredentials = useCallback(() => setCredentials(null), []);

  return { statusFor, errorFor, grant, credentials, clearCredentials };
}
