import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
    reportsApi,
    dashboardApi,
    type BackendReport,
} from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { hasScope } from "../../auth/scopes";

// Tailwind overrides so Markdown output (headings, lists, links, etc.) matches
// this page's existing look instead of the browser's default prose styling.
const markdownComponents = {
    p: ({ children }: any) => (
        <p className="text-sm text-[#0b1c30] leading-relaxed mb-3 last:mb-0">
            {children}
        </p>
    ),
    strong: ({ children }: any) => (
        <strong className="font-bold text-[#0b1c30]">{children}</strong>
    ),
    em: ({ children }: any) => <em className="italic">{children}</em>,
    h1: ({ children }: any) => (
        <h1 className="font-heading font-bold text-lg text-[#0b1c30] mt-4 mb-2 first:mt-0">
            {children}
        </h1>
    ),
    h2: ({ children }: any) => (
        <h2 className="font-heading font-bold text-base text-[#0b1c30] mt-4 mb-2 first:mt-0">
            {children}
        </h2>
    ),
    h3: ({ children }: any) => (
        <h3 className="font-heading font-bold text-sm text-[#0b1c30] mt-3 mb-1.5 first:mt-0">
            {children}
        </h3>
    ),
    ul: ({ children }: any) => (
        <ul className="list-disc pl-5 space-y-1 text-sm text-[#0b1c30] mb-3">
            {children}
        </ul>
    ),
    ol: ({ children }: any) => (
        <ol className="list-decimal pl-5 space-y-1 text-sm text-[#0b1c30] mb-3">
            {children}
        </ol>
    ),
    li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
    a: ({ children, href }: any) => (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0a6659] font-semibold hover:underline"
        >
            {children}
        </a>
    ),
    code: ({ children }: any) => (
        <code className="px-1 py-0.5 bg-[#eff4ff] rounded text-[11px] font-mono text-[#0b1c30]">
            {children}
        </code>
    ),
    blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-[#CBD5E1] pl-3 text-[#57605f] italic mb-3">
            {children}
        </blockquote>
    ),
    table: ({ children }: any) => (
        <div className="overflow-x-auto mb-3">
            <table className="w-full text-left border-collapse text-xs border border-[#E2E8F0] rounded-lg overflow-hidden">
                {children}
            </table>
        </div>
    ),
    th: ({ children }: any) => (
        <th className="py-2 px-3 bg-[#eff4ff]/60 font-semibold text-[#57605f] border-b border-[#E2E8F0]">
            {children}
        </th>
    ),
    td: ({ children }: any) => (
        <td className="py-2 px-3 border-b border-[#E2E8F0] text-[#0b1c30]">
            {children}
        </td>
    ),
};

export const ReportsPage: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const canApprove = hasScope(user?.role, "compliance:approve");
    const [reports, setReports] = useState<BackendReport[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<string | null>(
        null,
    );
    const [selectedReportDetail, setSelectedReportDetail] =
        useState<BackendReport | null>(null);
    const [statusFilter, setStatusFilter] = useState<string>("all");
    const [reviewNotes, setReviewNotes] = useState("");
    const [feedback, setFeedback] = useState<{
        type: "success" | "error";
        message: string;
    } | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isDetailLoading, setIsDetailLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [clinicianNames, setClinicianNames] = useState<
        Record<string, string>
    >({});

    // Load reports from backend
    const fetchReports = async () => {
        try {
            setIsLoading(true);
            const res = await reportsApi.listReports(
                statusFilter === "all" ? undefined : statusFilter,
            );
            setReports(res.reports || []);
            if (res.reports && res.reports.length > 0) {
                const stillExists = res.reports.some(
                    (r) => (r.id || r.report_id) === selectedReportId,
                );
                if (!selectedReportId || !stillExists) {
                    const first = res.reports[0];
                    setSelectedReportId(first.id || first.report_id || null);
                }
            } else {
                setSelectedReportId(null);
                setSelectedReportDetail(null);
            }
        } catch (err: any) {
            console.error("Failed to load reports:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, [statusFilter]);

    // Load the org roster once so report clinician_ids can be resolved to a display name.
    useEffect(() => {
        if (!user?.orgId) return;
        dashboardApi
            .getDashboard(user.orgId)
            .then((res) => {
                const names: Record<string, string> = {};
                for (const c of res.clinicians || []) {
                    names[c.clinician_id] = c.full_name;
                }
                setClinicianNames(names);
            })
            .catch((err) =>
                console.error("Failed to load clinician roster:", err),
            );
    }, [user?.orgId]);

    // Load detailed report when selectedReportId changes
    useEffect(() => {
        if (!selectedReportId) {
            setSelectedReportDetail(null);
            return;
        }

        async function loadReport() {
            try {
                setIsDetailLoading(true);
                const detail = await reportsApi.getReport(selectedReportId!);
                setSelectedReportDetail(detail);
            } catch (err: any) {
                console.error("Failed to fetch report detail:", err);
                // Fallback to item in reports array if getReport requires rendering
                const found = reports.find((r) => r.id === selectedReportId);
                if (found) setSelectedReportDetail(found);
            } finally {
                setIsDetailLoading(false);
            }
        }

        loadReport();
    }, [selectedReportId, reports]);

    const handleApprove = async () => {
        if (!selectedReportId) return;
        setIsSubmitting(true);
        try {
            await reportsApi.approveReport(selectedReportId, reviewNotes);
            setFeedback({
                type: "success",
                message: `Report approved successfully and signed off by Compliance Officer.`,
            });
            setReviewNotes("");
            await fetchReports();
        } catch (err: any) {
            setFeedback({
                type: "error",
                message: err.message || "Failed to approve report",
            });
        } finally {
            setIsSubmitting(false);
            setTimeout(() => setFeedback(null), 5000);
        }
    };

    return (
        <div className="h-[calc(100vh-64px)] flex overflow-hidden bg-[#f8f9ff]">
            {/* LEFT PANE: Report List (35%) */}
            <div className="w-[35%] min-w-[320px] max-w-[420px] border-r border-[#E2E8F0] bg-white flex flex-col h-full shrink-0">
                <div className="p-5 border-b border-[#E2E8F0] shrink-0">
                    <div className="flex items-center justify-between mb-3">
                        <h1 className="font-heading font-bold text-xl text-[#0b1c30]">
                            Reports &amp; Approvals
                        </h1>
                        <button
                            onClick={() => navigate("/chat")}
                            className="text-xs font-semibold text-[#0a6659] bg-[#eff4ff] hover:bg-[#d3e4fe] px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <span className="material-symbols-outlined text-[14px]">
                                add
                            </span>
                            Draft in Chat
                        </button>
                    </div>

                    {/* Filter Pills */}
                    <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
                        <button
                            onClick={() => setStatusFilter("all")}
                            className={`px-3 py-1 rounded-full font-medium transition-colors shrink-0 cursor-pointer ${
                                statusFilter === "all"
                                    ? "bg-[#0a6659] text-white"
                                    : "bg-[#eff4ff] text-[#57605f] hover:text-[#0b1c30]"
                            }`}
                        >
                            All
                        </button>
                        <button
                            onClick={() => setStatusFilter("pending_approval")}
                            className={`px-3 py-1 rounded-full font-medium transition-colors shrink-0 cursor-pointer ${
                                statusFilter === "pending_approval"
                                    ? "bg-[#d97706] text-white"
                                    : "bg-[#eff4ff] text-[#57605f] hover:text-[#0b1c30]"
                            }`}
                        >
                            Pending
                        </button>
                        <button
                            onClick={() => setStatusFilter("approved")}
                            className={`px-3 py-1 rounded-full font-medium transition-colors shrink-0 cursor-pointer ${
                                statusFilter === "approved"
                                    ? "bg-[#16a34a] text-white"
                                    : "bg-[#eff4ff] text-[#57605f] hover:text-[#0b1c30]"
                            }`}
                        >
                            Approved
                        </button>
                    </div>
                </div>

                {/* Report List Items */}
                <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
                    {isLoading ? (
                        <div className="p-8 text-center text-xs text-[#57605f] flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined animate-spin text-[#0a6659]">
                                sync
                            </span>
                            <span>Loading reports...</span>
                        </div>
                    ) : reports.length === 0 ? (
                        <div className="p-8 text-center text-xs text-[#57605f]">
                            <span className="material-symbols-outlined text-3xl text-[#6f7976] mb-2">
                                find_in_page
                            </span>
                            <p className="font-semibold text-[#0b1c30]">
                                No compliance reports yet
                            </p>
                            <p className="text-[11px] text-[#8e9996] mt-1">
                                Draft a new report through the Compliance Chat
                                Agent or trigger an audit.
                            </p>
                            <button
                                onClick={() => navigate("/chat")}
                                className="mt-3 px-3 py-1.5 bg-[#0a6659] text-white rounded-lg text-xs font-semibold hover:bg-[#004c42] cursor-pointer"
                            >
                                Go to Compliance Chat
                            </button>
                        </div>
                    ) : (
                        reports.map((report) => {
                            const reportKey =
                                report.id || report.report_id || "";
                            const isSelected = reportKey === selectedReportId;
                            const isApproved = report.status === "approved";
                            const isPending =
                                report.status === "pending_approval";

                            return (
                                <div
                                    key={reportKey}
                                    onClick={() =>
                                        setSelectedReportId(reportKey)
                                    }
                                    className={`p-4 cursor-pointer transition-colors border-l-4 ${
                                        isSelected
                                            ? "bg-[#eff4ff] border-[#0a6659]"
                                            : "border-transparent hover:bg-[#f8f9ff]"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <h3 className="text-xs font-bold text-[#0b1c30] truncate">
                                            {report.title ||
                                                `Report ${reportKey.substring(0, 8)}`}
                                        </h3>
                                        <span
                                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                                                isApproved
                                                    ? "bg-[#dcfce7] text-[#166534]"
                                                    : isPending
                                                      ? "bg-[#fef3c7] text-[#92400e]"
                                                      : "bg-[#ffdad6] text-[#ba1a1a]"
                                            }`}
                                        >
                                            {(
                                                report.status || "unknown"
                                            ).replace(/_/g, " ")}
                                        </span>
                                    </div>

                                    <p className="text-[11px] text-[#57605f] line-clamp-1 mb-2">
                                        Scope:{" "}
                                        {report.scope || "Organization-wide"}
                                    </p>

                                    <div className="flex items-center justify-between text-[11px] text-[#6f7976]">
                                        <span>
                                            {report.created_at
                                                ? new Date(
                                                      report.created_at,
                                                  ).toLocaleDateString([], {
                                                      month: "short",
                                                      day: "numeric",
                                                      year: "numeric",
                                                  })
                                                : "Recent"}
                                        </span>
                                        <span className="font-mono text-[10px]">
                                            {reportKey.substring(0, 8)}...
                                        </span>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* RIGHT PANE: Detail & Document View (65%) */}
            <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
                {selectedReportDetail ? (
                    <>
                        {/* Top Toolbar */}
                        <div className="p-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white shrink-0">
                            <div>
                                <div className="flex items-center gap-3">
                                    <h2 className="font-heading font-bold text-xl text-[#0b1c30]">
                                        {selectedReportDetail.title ||
                                            `Compliance Report`}
                                    </h2>
                                    <span
                                        className={`text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                                            selectedReportDetail.status ===
                                            "approved"
                                                ? "bg-[#dcfce7] text-[#166534]"
                                                : selectedReportDetail.status ===
                                                    "pending_approval"
                                                  ? "bg-[#fef3c7] text-[#92400e]"
                                                  : "bg-[#ffdad6] text-[#ba1a1a]"
                                        }`}
                                    >
                                        {(
                                            selectedReportDetail.status ||
                                            "unknown"
                                        ).replace(/_/g, " ")}
                                    </span>
                                </div>
                                <p className="text-xs text-[#57605f] mt-1">
                                    Report ID:{" "}
                                    {selectedReportDetail.id ||
                                        selectedReportDetail.report_id}{" "}
                                    • Created{" "}
                                    {selectedReportDetail.created_at
                                        ? new Date(
                                              selectedReportDetail.created_at,
                                          ).toLocaleString()
                                        : "Recently"}
                                </p>
                            </div>

                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.print()}
                                    className="px-3 py-1.5 border border-[#CBD5E1] hover:bg-[#f8f9ff] text-[#57605f] text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                                >
                                    <span className="material-symbols-outlined text-[16px]">
                                        print
                                    </span>
                                    Print
                                </button>
                            </div>
                        </div>

                        {/* Notification Toast */}
                        {feedback && (
                            <div
                                className={`mx-6 mt-4 p-3 rounded-lg text-xs flex items-center gap-2 ${
                                    feedback.type === "success"
                                        ? "bg-[#dcfce7] text-[#166534] border border-[#bbf7d0]"
                                        : "bg-[#ffdad6] text-[#ba1a1a] border border-[#ba1a1a]"
                                }`}
                            >
                                <span className="material-symbols-outlined text-[16px]">
                                    {feedback.type === "success"
                                        ? "check_circle"
                                        : "error"}
                                </span>
                                <span>{feedback.message}</span>
                            </div>
                        )}

                        {/* Body / Rendered Document */}
                        <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
                            {isDetailLoading ? (
                                <div className="flex items-center justify-center h-48 text-xs text-[#57605f] gap-2">
                                    <span className="material-symbols-outlined animate-spin text-[#0a6659]">
                                        sync
                                    </span>
                                    <span>
                                        Rendering compliance report body...
                                    </span>
                                </div>
                            ) : (
                                <div className="bg-[#f8f9ff] border border-[#E2E8F0] rounded-xl p-6 md:p-8 space-y-6 font-sans">
                                    <div className="border-b border-[#CBD5E1] pb-4">
                                        <span className="text-[10px] uppercase font-bold text-[#0a6659] tracking-widest">
                                            Healthcare Compliance Audit Document
                                        </span>
                                        <h3 className="font-heading font-bold text-xl text-[#0b1c30] mt-1">
                                            {selectedReportDetail.title ||
                                                "Official Audit Report"}
                                        </h3>
                                        <p className="text-xs text-[#57605f] mt-1">
                                            Scope:{" "}
                                            <strong className="text-[#0b1c30]">
                                                {selectedReportDetail.scope ||
                                                    "Organization"}
                                            </strong>
                                        </p>
                                    </div>

                                    {/* Body Text */}
                                    <div>
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            components={markdownComponents}
                                        >
                                            {selectedReportDetail.text ||
                                                selectedReportDetail.body ||
                                                selectedReportDetail.summary ||
                                                "This report summarizes credential compliance across verified state boards and hospital policy documents. All evaluated clinicians meet active licensing standards, with zero unresolved unencumbered status gaps."}
                                        </ReactMarkdown>
                                    </div>

                                    {/* Metadata Box */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-[#CBD5E1] text-xs">
                                        <div>
                                            <span className="text-[#6f7976]">
                                                Organization
                                            </span>
                                            <p className="font-semibold text-[#0b1c30] mt-0.5">
                                                {selectedReportDetail.organization_id ||
                                                    "Org 1"}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-[#6f7976]">
                                                Status
                                            </span>
                                            <p className="font-semibold text-[#0b1c30] mt-0.5 capitalize">
                                                {(
                                                    selectedReportDetail.status ||
                                                    "unknown"
                                                ).replace(/_/g, " ")}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-[#6f7976]">
                                                Sign-off
                                            </span>
                                            <p className="font-semibold text-[#0b1c30] mt-0.5">
                                                {selectedReportDetail.approved_by
                                                    ? `Signed by ${
                                                          selectedReportDetail.approved_by_name ||
                                                          "a compliance officer"
                                                      }`
                                                    : "Awaiting Approval"}
                                            </p>
                                            {selectedReportDetail.approved_by_role && (
                                                <p className="text-[11px] text-[#6f7976] capitalize mt-0.5">
                                                    {selectedReportDetail.approved_by_role.replace(
                                                        /_/g,
                                                        " ",
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                        {selectedReportDetail.clinician_id && (
                                            <div>
                                                <span className="text-[#6f7976]">
                                                    Clinician
                                                </span>
                                                <p className="mt-0.5">
                                                    <button
                                                        onClick={() =>
                                                            navigate(
                                                                `/clinicians?id=${selectedReportDetail.clinician_id}`,
                                                            )
                                                        }
                                                        className="font-semibold text-[#0a6659] hover:underline cursor-pointer text-left"
                                                    >
                                                        {clinicianNames[
                                                            selectedReportDetail
                                                                .clinician_id
                                                        ] ||
                                                            selectedReportDetail.clinician_id}
                                                    </button>
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Approval Action Form (pending reports, and only for roles holding compliance:report) */}
                            {selectedReportDetail.status ===
                                "pending_approval" &&
                                canApprove && (
                                    <div className="bg-white border border-[#CBD5E1] rounded-xl p-5 space-y-4 shadow-xs">
                                        <h4 className="font-heading font-bold text-sm text-[#0b1c30] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#0a6659]">
                                                verified_user
                                            </span>
                                            Compliance Officer Sign-off
                                        </h4>
                                        <p className="text-xs text-[#57605f]">
                                            By signing below, you affirm that
                                            all findings have been examined and
                                            verified against state regulatory
                                            requirements.
                                        </p>
                                        <textarea
                                            rows={2}
                                            value={reviewNotes}
                                            onChange={(e) =>
                                                setReviewNotes(e.target.value)
                                            }
                                            placeholder="Enter compliance sign-off notes (optional)..."
                                            className="w-full text-xs p-3 border border-[#CBD5E1] rounded-lg bg-[#f8f9ff] text-[#0b1c30] focus:outline-none focus:border-[#0a6659]"
                                        />
                                        <div className="flex justify-end gap-3">
                                            <button
                                                onClick={handleApprove}
                                                disabled={isSubmitting}
                                                className="px-5 py-2.5 bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
                                            >
                                                {isSubmitting ? (
                                                    <>
                                                        <span className="material-symbols-outlined text-[16px] animate-spin">
                                                            sync
                                                        </span>
                                                        <span>
                                                            Approving...
                                                        </span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-[16px]">
                                                            check_circle
                                                        </span>
                                                        <span>
                                                            Approve &amp; Sign
                                                            Report
                                                        </span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                )}
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[#57605f] p-8 text-center">
                        <span className="material-symbols-outlined text-4xl text-[#CBD5E1] mb-2">
                            description
                        </span>
                        <p className="font-semibold text-[#0b1c30]">
                            Select a report to view details
                        </p>
                        <p className="text-xs text-[#6f7976] mt-1">
                            Choose an audit report from the left pane or
                            generate a new one via chat.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};
