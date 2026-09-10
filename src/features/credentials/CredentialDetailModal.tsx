import React, { useCallback, useEffect, useState } from "react";
import { credentialsApi, type CredentialDetail } from "../../services/api";
import { titleCase, formatDate, formatDateTime } from "./formatters";

interface CredentialDetailModalProps {
  credentialId: string;
  onClose: () => void;
  /** When provided (e.g. opened via "Open the credential" from a document), shows a
   * "Back to document" button that returns to the caller instead of closing entirely. */
  onBack?: () => void;
}

interface ComparisonRow {
  label: string;
  documentValue: string;
  authorityValue: string;
  mismatch: boolean;
  unverifiable: boolean;
}

const COMPARED_FIELDS: { key: "holder_name" | "identifier" | "jurisdiction" | "expires_on"; label: string }[] = [
  { key: "holder_name", label: "Holder name" },
  { key: "identifier", label: "Identifier" },
  { key: "jurisdiction", label: "Jurisdiction" },
  { key: "expires_on", label: "Expires on" },
];

// Best-effort reconstruction: the backend only persists MISMATCHED fields
// (verifications[].mismatches.fields); a matched field has no stored
// authority-side value. If an authority check happened and this field wasn't
// flagged as a mismatch, we infer agreement and show the document's own
// value on both sides rather than inventing data. See plan's "Known limitations".
function buildComparisonRows(cred: CredentialDetail): ComparisonRow[] {
  const latestVerification = cred.verifications[cred.verifications.length - 1];
  const hasAuthorityCheck = cred.external_verifications.length > 0;

  return COMPARED_FIELDS.map(({ key, label }) => {
    const documentValue = cred[key] || "—";
    const mismatch = latestVerification?.mismatches?.fields?.find(
      (f) => f.field === key && f.source === "authority"
    );

    if (mismatch) {
      return { label, documentValue, authorityValue: mismatch.authority || "—", mismatch: true, unverifiable: false };
    }
    if (hasAuthorityCheck) {
      return { label, documentValue, authorityValue: documentValue, mismatch: false, unverifiable: false };
    }
    return { label, documentValue, authorityValue: "Not verifiable via authority", mismatch: false, unverifiable: true };
  });
}

interface TimelineEntry {
  key: string;
  label: string;
  timestamp: string;
  degraded?: boolean;
  kind: "authority" | "comparison";
}

function buildTimeline(cred: CredentialDetail): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const ev of cred.external_verifications) {
    entries.push({
      key: `ext-${ev.id}`,
      label: `${titleCase(ev.source)} answered ${titleCase(ev.authority_status_raw || ev.authority_status)}`,
      timestamp: ev.fetched_at,
      degraded: ev.degraded,
      kind: "authority",
    });
  }

  for (const v of cred.verifications) {
    entries.push({
      key: `ver-${v.id}`,
      label: `Comparison: ${titleCase(v.outcome)}`,
      timestamp: v.created_at,
      kind: "comparison",
    });
  }

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

export const CredentialDetailModal: React.FC<CredentialDetailModalProps> = ({ credentialId, onClose, onBack }) => {
  const [cred, setCred] = useState<CredentialDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isReverifying, setIsReverifying] = useState(false);
  const [reverifyError, setReverifyError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await credentialsApi.getCredential(credentialId);
      setCred(data);
    } catch (err: any) {
      setError(err.message || "Failed to load credential");
    } finally {
      setLoading(false);
    }
  }, [credentialId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleReverify = async () => {
    setIsReverifying(true);
    setReverifyError(null);
    try {
      const fresh = await credentialsApi.reverifyAndRefresh(credentialId);
      setCred(fresh);
    } catch (err: any) {
      setReverifyError(err.message || "Failed to re-check the authority");
    } finally {
      setIsReverifying(false);
    }
  };

  const latestExternal = cred?.external_verifications[cred.external_verifications.length - 1];
  const latestVerification = cred?.verifications[cred.verifications.length - 1];
  const comparisonRows = cred ? buildComparisonRows(cred) : [];
  const timeline = cred ? buildTimeline(cred) : [];

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] shadow-2xl border border-[#CBD5E1] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#E2E8F0] flex items-start justify-between gap-4 shrink-0">
          <div>
            {onBack && (
              <button
                onClick={onBack}
                className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#0a6659] hover:text-[#004c42] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                Back to document
              </button>
            )}
            <h2 className="font-heading font-bold text-xl text-[#0b1c30]">{titleCase(cred?.credential_type)}</h2>
            {cred && (
              <p className="text-xs text-[#57605f] mt-1">
                {cred.holder_name || "—"} · <span className="font-mono">{cred.identifier || "—"}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleReverify}
              disabled={isReverifying || loading}
              className="px-4 py-2 bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              {isReverifying ? (
                <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
              ) : (
                <span className="material-symbols-outlined text-[16px]">refresh</span>
              )}
              Check the authority again
            </button>
            <button onClick={onClose} className="text-[#6f7976] hover:text-[#0b1c30] cursor-pointer">
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2 text-sm">
              <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
              <span>Loading credential...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-sm">{error}</div>
          ) : cred ? (
            <>
              {reverifyError && (
                <div className="p-3 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-xs">
                  {reverifyError}
                </div>
              )}

              {/* Three summary boxes */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                  <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider mb-1">
                    What the board said
                  </p>
                  <p className="text-sm font-bold text-[#0b1c30]">
                    {latestExternal ? titleCase(latestExternal.authority_status_raw || latestExternal.authority_status) : "—"}
                  </p>
                  {latestExternal && (
                    <p className="text-[10px] text-[#6f7976] mt-1">checked {formatDateTime(latestExternal.fetched_at)}</p>
                  )}
                </div>
                <div className="p-4 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                  <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider mb-1">
                    Whether they agreed
                  </p>
                  <p className="text-sm font-bold text-[#0b1c30]">
                    {latestVerification ? titleCase(latestVerification.outcome) : "—"}
                  </p>
                  {latestVerification && (
                    <p className="text-[10px] text-[#6f7976] mt-1">{formatDateTime(latestVerification.created_at)}</p>
                  )}
                </div>
                <div className="p-4 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                  <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider mb-1">
                    What we concluded
                  </p>
                  <p className="text-base font-bold text-[#0b1c30]">{titleCase(cred.status)}</p>
                </div>
              </div>

              {/* Comparison table */}
              <div>
                <h3 className="font-heading font-bold text-sm text-[#0b1c30] mb-3">The comparison</h3>
                <div className="border border-[#E2E8F0] rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead className="bg-[#eff4ff]/60 text-[10px] font-semibold text-[#57605f] uppercase tracking-wider border-b border-[#E2E8F0]">
                      <tr>
                        <th className="py-2.5 px-4">Field</th>
                        <th className="py-2.5 px-4">On the document</th>
                        <th className="py-2.5 px-4">At the authority</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] text-xs">
                      {comparisonRows.map((row) => (
                        <tr key={row.label} className={row.mismatch ? "bg-[#ffdad6]/20" : ""}>
                          <td className="py-2.5 px-4 font-medium text-[#0b1c30] flex items-center gap-1.5">
                            {row.mismatch && (
                              <span className="material-symbols-outlined text-[14px] text-[#ba1a1a]">warning</span>
                            )}
                            {row.label}
                          </td>
                          <td className="py-2.5 px-4 text-[#0b1c30]">{row.documentValue}</td>
                          <td className={`py-2.5 px-4 ${row.mismatch ? "text-[#ba1a1a] font-semibold" : row.unverifiable ? "text-[#6f7976] italic" : "text-[#0b1c30]"}`}>
                            {row.authorityValue}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Timeline */}
              <div>
                <h3 className="font-heading font-bold text-sm text-[#0b1c30] mb-1">Timeline</h3>
                <p className="text-[11px] text-[#6f7976] mb-3">
                  Every check appends. Nothing here is overwritten, which is what makes a claim defensible months later.
                </p>
                {timeline.length === 0 ? (
                  <p className="text-xs text-[#6f7976]">No verification attempts yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {timeline.map((entry) => (
                      <li key={entry.key} className="flex items-start gap-3">
                        <span
                          className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                            entry.kind === "comparison" ? "bg-[#0a6659]" : "bg-[#6f7976]"
                          }`}
                        />
                        <div>
                          <p className="text-xs font-medium text-[#0b1c30]">
                            {entry.label}
                            {entry.degraded && (
                              <span className="ml-1.5 text-[#9a6700] font-normal">
                                — degraded (no determination was reached)
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-[#6f7976] mt-0.5">{formatDateTime(entry.timestamp)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Dates */}
              <div>
                <h3 className="font-heading font-bold text-sm text-[#0b1c30] mb-3">Dates</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg text-xs">
                  <div>
                    <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Issued</p>
                    <p className="text-[#0b1c30] font-medium">{formatDate(cred.issued_on)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Expires (As Printed)</p>
                    <p className="text-[#0b1c30] font-medium">{formatDate(cred.expires_on)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Expires (Effective)</p>
                    <p className="text-[#0b1c30] font-medium">{formatDate(cred.effective_expires_on)}</p>
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
