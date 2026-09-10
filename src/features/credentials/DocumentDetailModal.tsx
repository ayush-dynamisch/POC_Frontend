import React, { useCallback, useEffect, useRef, useState } from "react";
import { documentsApi, credentialsApi, type DocumentDetail } from "../../services/api";
import { titleCase, formatPercent } from "./formatters";

interface DocumentDetailModalProps {
  documentId: string;
  onClose: () => void;
  onOpenCredential: (credentialId: string) => void;
  onReviewChange?: () => void;
}

const REVIEW_STATUS_LABEL: Record<string, string> = {
  not_required: "Not required",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  documentId,
  onClose,
  onOpenCredential,
  onReviewChange,
}) => {
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decidingCheckId, setDecidingCheckId] = useState<string | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [bulkDeciding, setBulkDeciding] = useState<"approve" | "reject" | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await documentsApi.getDocument(documentId);
      setDoc(data);
      return data;
    } catch (err: any) {
      setError(err.message || "Failed to load document");
      return null;
    } finally {
      setLoading(false);
    }
  }, [documentId]);

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

  // Clear any pending auto-close timer if the modal is unmounted before it fires
  // (e.g. the user closes it manually while the success message is showing).
  useEffect(() => {
    return () => {
      if (closeTimerRef.current) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const scheduleAutoClose = (message: string) => {
    setActionSuccess(message);
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 1400);
  };

  const handleDecision = async (checkId: string, decision: "approve" | "reject") => {
    setDecidingCheckId(checkId);
    setDecisionError(null);
    try {
      await documentsApi.reviewCheck(checkId, decision);
      const fresh = await load();
      onReviewChange?.();
      const stillPending = fresh?.checks.some((c) => c.review_status === "pending");
      if (!stillPending) {
        scheduleAutoClose(decision === "approve" ? "Check approved." : "Check rejected.");
      }
    } catch (err: any) {
      setDecisionError(err.message || "Failed to submit decision");
    } finally {
      setDecidingCheckId(null);
    }
  };

  const handleBulkDecision = async (decision: "approve" | "reject") => {
    setBulkDeciding(decision);
    setDecisionError(null);
    setActionSuccess(null);
    try {
      let checkError: any = null;
      if (pendingChecks.length > 0) {
        for (const check of pendingChecks) {
          try {
            await documentsApi.reviewCheck(check.id, decision);
          } catch (err: any) {
            checkError = err;
          }
        }
      }
      if (doc?.credential?.id) {
        try {
          await credentialsApi.review(doc.credential.id, decision);
        } catch (err: any) {
          if (!checkError) {
            checkError = err;
          }
        }
      }
      if (checkError) {
        throw checkError;
      }
      await load();
      onReviewChange?.();
      scheduleAutoClose(
        decision === "approve"
          ? "Document and credential approved successfully."
          : "Document and credential rejected."
      );
    } catch (err: any) {
      setDecisionError(err.message || `Failed to ${decision} document`);
    } finally {
      setBulkDeciding(null);
    }
  };

  const pendingChecks = doc?.checks.filter((c) => c.review_status === "pending") || [];
  const passedCount = doc?.checks.filter((c) => c.passed === true).length ?? 0;
  const failedCount = doc?.checks.filter((c) => c.passed === false).length ?? 0;
  const pendingCount = pendingChecks.length;
  const totalChecks = doc?.checks.length ?? 0;
  const isCredentialVerified = doc?.credential?.status === "verified";
  const isCredentialRejected = doc?.credential?.status === "rejected";

  const verdictLabel =
    isCredentialRejected
      ? "Rejected"
      : isCredentialVerified
        ? "Approved & Verified"
        : totalChecks === 0
          ? "No Checks"
          : pendingCount > 0
            ? "Needs Review"
            : failedCount > 0
              ? "Issues Found"
              : "All Checks Passed";
  const verdictColor =
    isCredentialRejected
      ? "bg-[#ffdad6] text-[#ba1a1a] border-[#ffb4ab]"
      : isCredentialVerified
        ? "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]"
        : totalChecks === 0
          ? "bg-[#f1f5f9] text-[#57605f] border-[#E2E8F0]"
          : pendingCount > 0
            ? "bg-[#fff8e1] text-[#9a6700] border-[#f5deb3]"
            : failedCount > 0
              ? "bg-[#ffdad6] text-[#ba1a1a] border-[#ffb4ab]"
              : "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]";

  const fields = doc?.ocr?.extracted_fields?.fields;
  const rawText = doc?.ocr?.extracted_fields?.raw_text;
  const ocrJobId = doc?.ocr?.extracted_fields?.ocr_job_id;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[85vh] shadow-2xl border border-[#CBD5E1] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-[#E2E8F0] flex items-start justify-between gap-4 shrink-0">
          <div>
            <h2 className="font-heading font-bold text-xl text-[#0b1c30]">
              {titleCase(doc?.credential_type || doc?.document_type)}
            </h2>
            {doc && (
              <p className="text-xs text-[#57605f] mt-1">
                {titleCase(doc.document_type)} · {titleCase(doc.status)}
                {doc.ocr?.confidence != null && ` · OCR confidence ${formatPercent(doc.ocr.confidence)}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {doc?.credential && (
              <button
                onClick={() => onOpenCredential(doc.credential!.id)}
                className="px-4 py-2 bg-[#0a6659] hover:bg-[#004c42] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Open the credential
              </button>
            )}
            <button onClick={onClose} className="text-[#6f7976] hover:text-[#0b1c30] cursor-pointer">
              <span className="material-symbols-outlined text-[22px]">close</span>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2 text-sm">
              <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
              <span>Loading document...</span>
            </div>
          ) : error ? (
            <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-sm">{error}</div>
          ) : doc ? (
            <>
              {/* Pending decision panel(s) */}
              {pendingChecks.map((check) => (
                <div key={check.id} className="p-4 bg-[#fff8e1] border-l-4 border-[#d97706] rounded-lg space-y-3">
                  <div>
                    <h3 className="font-heading font-bold text-sm text-[#0b1c30]">One check needs your decision</h3>
                    <p className="text-xs text-[#57605f] mt-1">
                      {titleCase(check.check_type)} did not pass automatically and needs a human decision before this
                      credential can be considered compliant.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[#57605f]">
                    <span className="font-semibold uppercase tracking-wider">{titleCase(check.check_type)}</span>
                    <span>Confidence: {formatPercent(check.confidence)}</span>
                  </div>
                  {decisionError && (
                    <p className="text-xs text-[#ba1a1a]">{decisionError}</p>
                  )}
                  <div className="flex gap-2">
                    <button
                      disabled={decidingCheckId === check.id}
                      onClick={() => handleDecision(check.id, "approve")}
                      className="px-4 py-1.5 bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Approve
                    </button>
                    <button
                      disabled={decidingCheckId === check.id}
                      onClick={() => handleDecision(check.id, "reject")}
                      className="px-4 py-1.5 border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ffdad6] disabled:opacity-50 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))}

              {/* What the document says */}
              <div>
                <h3 className="font-heading font-bold text-sm text-[#0b1c30] mb-3">What the document says</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-3 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                    <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider mb-1.5">Fields</p>
                    {fields && Object.keys(fields).length > 0 ? (
                      <dl className="space-y-1 text-xs">
                        {Object.entries(fields).map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <dt className="text-[#6f7976] capitalize shrink-0">{titleCase(k)}</dt>
                            <dd className="text-[#0b1c30] font-medium text-right truncate">{v === null || v === undefined || v === "" ? "—" : String(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-[#6f7976]">No fields extracted</p>
                    )}
                  </div>
                  <div className="p-3 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                    <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider mb-1.5">Raw Text</p>
                    <p className="text-[11px] text-[#0b1c30] whitespace-pre-line font-mono leading-relaxed">
                      {rawText || "—"}
                    </p>
                  </div>
                  <div className="p-3 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                    <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider mb-1.5">OCR Job ID</p>
                    <p className="text-xs font-mono text-[#0b1c30]">{ocrJobId || "—"}</p>
                  </div>
                </div>
              </div>

              {/* Checks table */}
              <div>
                <h3 className="font-heading font-bold text-sm text-[#0b1c30] mb-3">Checks</h3>
                <div className="border border-[#E2E8F0] rounded-lg overflow-hidden overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[500px]">
                    <thead className="bg-[#eff4ff]/60 text-[10px] font-semibold text-[#57605f] uppercase tracking-wider border-b border-[#E2E8F0]">
                      <tr>
                        <th className="py-2.5 px-4">Check</th>
                        <th className="py-2.5 px-4">Result</th>
                        <th className="py-2.5 px-4">Confidence</th>
                        <th className="py-2.5 px-4">Review</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E2E8F0] text-xs">
                      {doc.checks.map((check) => (
                        <tr key={check.id}>
                          <td className="py-2.5 px-4 font-medium text-[#0b1c30]">{titleCase(check.check_type)}</td>
                          <td className="py-2.5 px-4">
                            {check.passed === null ? (
                              <span className="text-[#6f7976]">—</span>
                            ) : check.passed ? (
                              <span className="text-[#166534] font-semibold">Passed</span>
                            ) : (
                              <span className="text-[#ba1a1a] font-semibold">Failed</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-[#57605f]">{formatPercent(check.confidence)}</td>
                          <td className="py-2.5 px-4">
                            <span
                              className={
                                check.review_status === "pending"
                                  ? "text-[#9a6700] font-semibold"
                                  : check.review_status === "rejected"
                                    ? "text-[#ba1a1a] font-semibold"
                                    : "text-[#57605f]"
                              }
                            >
                              {REVIEW_STATUS_LABEL[check.review_status] || titleCase(check.review_status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Drafted credential */}
              {doc.credential && (
                <div>
                  <h3 className="font-heading font-bold text-sm text-[#0b1c30] mb-3">The drafted credential</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 p-4 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg text-xs">
                    <div>
                      <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Holder</p>
                      <p className="text-[#0b1c30] font-medium">{doc.credential.holder_name || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Identifier</p>
                      <p className="text-[#0b1c30] font-medium font-mono">{doc.credential.identifier || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Jurisdiction</p>
                      <p className="text-[#0b1c30] font-medium">{doc.credential.jurisdiction || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Issued</p>
                      <p className="text-[#0b1c30] font-medium">{doc.credential.issued_on || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Expires (Printed)</p>
                      <p className="text-[#0b1c30] font-medium">{doc.credential.expires_on || "—"}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold text-[#6f7976] uppercase tracking-wider">Expires (Effective)</p>
                      <p className="text-[#0b1c30] font-medium">{doc.credential.effective_expires_on || "—"}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Verification Summary — sticky footer */}
        {doc && (
          <div className="p-4 border-t border-[#E2E8F0] bg-[#f8f9ff]/80 shrink-0">
            {decisionError && (
              <p className="text-xs text-[#ba1a1a] mb-2">{decisionError}</p>
            )}
            {actionSuccess && (
              <div className="p-2.5 mb-2 bg-[#dcfce7] border border-[#bbf7d0] text-[#166534] rounded-lg text-xs flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                <span>{actionSuccess} Closing automatically…</span>
              </div>
            )}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              {/* Left: counts + verdict */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  {passedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] font-semibold border border-[#bbf7d0]">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      {passedCount} Passed
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#ffdad6] text-[#ba1a1a] font-semibold border border-[#ffb4ab]">
                      <span className="material-symbols-outlined text-[14px]">cancel</span>
                      {failedCount} Failed
                    </span>
                  )}
                  {pendingCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#fff8e1] text-[#9a6700] font-semibold border border-[#f5deb3]">
                      <span className="material-symbols-outlined text-[14px]">pending</span>
                      {pendingCount} Pending
                    </span>
                  )}
                </div>
                {/* Overall verdict badge */}
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider border ${verdictColor}`}>
                  {verdictLabel}
                </span>
              </div>

              {/* Right: Approve & Reject action buttons — disabled once nothing is left to decide */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleBulkDecision("reject")}
                  disabled={!!bulkDeciding || pendingCount === 0}
                  title={pendingCount === 0 ? "This document has already been reviewed — nothing pending" : undefined}
                  className="px-4 py-2 rounded-lg border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ffdad6] disabled:opacity-50 disabled:cursor-not-allowed text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {bulkDeciding === "reject" ? (
                    <span className="material-symbols-outlined text-[15px] animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-[15px]">cancel</span>
                  )}
                  {pendingCount > 1 ? `Reject All (${pendingCount})` : "Reject"}
                </button>
                <button
                  type="button"
                  onClick={() => handleBulkDecision("approve")}
                  disabled={!!bulkDeciding || pendingCount === 0}
                  title={pendingCount === 0 ? "This document has already been reviewed — nothing pending" : undefined}
                  className="px-4 py-2 rounded-lg bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {bulkDeciding === "approve" ? (
                    <span className="material-symbols-outlined text-[15px] animate-spin">sync</span>
                  ) : (
                    <span className="material-symbols-outlined text-[15px]">check_circle</span>
                  )}
                  {pendingCount > 1 ? `Approve All (${pendingCount})` : "Approve"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
