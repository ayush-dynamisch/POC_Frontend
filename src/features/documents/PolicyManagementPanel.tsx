import React, { useEffect, useState } from "react";
import { policiesApi, type PolicySummary } from "../../services/api";
import { useJobStream } from "../../hooks/useJobStream";
import { STEP_LABELS } from "../../types/events";
import type { Role } from "../../types";
import { PolicyReviewModal } from "./PolicyReviewModal";

const ALL_ROLES: Role[] = [
    "super_admin",
    "admin",
    "compliance_officer",
    "hr",
    "clinician",
];

const STATUS_BADGE: Record<PolicySummary["status"], string> = {
    draft: "bg-[#fff8e1] text-[#9a6700] border-[#f5deb3]",
    published: "bg-[#dcfce7] text-[#166534] border-[#bbf7d0]",
    superseded: "bg-[#eff4ff] text-[#57605f] border-[#E2E8F0]",
};

interface UploadSummary {
    policy_document_id: string;
    chunks?: number;
    embedded?: number;
    proposed_requirements?: number;
    rejected_citations?: number;
    next?: string;
}

export const PolicyManagementPanel: React.FC = () => {
    const { liveSteps, startStream, cancelStream } = useJobStream();

    const [title, setTitle] = useState("");
    const [jurisdiction, setJurisdiction] = useState("");
    const [version, setVersion] = useState("");
    const [allowedRoles, setAllowedRoles] = useState<Role[]>([]);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState("");

    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [uploadSummary, setUploadSummary] = useState<UploadSummary | null>(
        null,
    );

    const [policies, setPolicies] = useState<PolicySummary[]>([]);
    const [isLoadingPolicies, setIsLoadingPolicies] = useState(true);
    const [listError, setListError] = useState<string | null>(null);

    const [reviewPolicyId, setReviewPolicyId] = useState<string | null>(null);
    const [supersedeError, setSupersedeError] = useState<string | null>(null);

    useEffect(() => {
        return () => cancelStream();
    }, [cancelStream]);

    const loadPolicies = async () => {
        setIsLoadingPolicies(true);
        setListError(null);
        try {
            const res = await policiesApi.list();
            setPolicies(res.documents || []);
        } catch (err: any) {
            setListError(err.message || "Failed to load policy documents");
        } finally {
            setIsLoadingPolicies(false);
        }
    };

    useEffect(() => {
        loadPolicies();
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setFileName(file.name);
        }
    };

    const toggleRole = (role: Role) => {
        setAllowedRoles((prev) =>
            prev.includes(role)
                ? prev.filter((r) => r !== role)
                : [...prev, role],
        );
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim()) {
            setUploadError("Please provide a policy title");
            return;
        }
        if (!selectedFile) {
            setUploadError("Please select a file to upload");
            return;
        }

        setIsUploading(true);
        setUploadError(null);
        setUploadSummary(null);

        try {
            const res = await policiesApi.upload(title.trim(), selectedFile, {
                jurisdiction: jurisdiction.trim() || undefined,
                version: version.trim() || undefined,
                allowedRoles,
            });

            const terminalEvent = await startStream(res.job_id);

            if (terminalEvent.step === "complete") {
                const output = terminalEvent.output || {};
                setUploadSummary({
                    policy_document_id:
                        output.policy_document_id || res.policy_document_id,
                    chunks: output.chunks,
                    embedded: output.embedded,
                    proposed_requirements: output.proposed_requirements,
                    rejected_citations: output.rejected_citations,
                    next: output.next,
                });
                setTitle("");
                setJurisdiction("");
                setVersion("");
                setAllowedRoles([]);
                setSelectedFile(null);
                setFileName("");
                loadPolicies();
            } else if (terminalEvent.step === "error") {
                setUploadError(
                    terminalEvent.message || "Policy ingestion failed",
                );
            }
        } catch (err: any) {
            setUploadError(err.message || "Failed to upload policy document");
        } finally {
            setIsUploading(false);
        }
    };

    const handleSupersede = async (policyId: string) => {
        if (
            !window.confirm(
                "Supersede this published policy? Its active requirements will be retired.",
            )
        )
            return;
        setSupersedeError(null);
        try {
            await policiesApi.supersede(policyId);
            loadPolicies();
        } catch (err: any) {
            setSupersedeError(err.message || "Failed to supersede policy");
        }
    };

    return (
        <div className="space-y-8">
            {/* Upload Card */}
            <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 md:p-8 shadow-xs">
                <h2 className="font-heading font-bold text-lg text-[#0b1c30] mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#0a6659] text-[22px]">
                        gavel
                    </span>
                    Upload Policy Document
                </h2>

                <form onSubmit={handleUpload} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex flex-col gap-2 md:col-span-2">
                            <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                Policy Title{" "}
                                <span className="text-[#ba1a1a]">*</span>
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. California RN Licensing Requirements 2026"
                                className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                File (PDF)
                            </label>
                            <label className="w-full h-11 flex items-center justify-between bg-[#eff4ff] border border-[#CBD5E1] border-dashed rounded-lg px-4 text-sm text-[#0b1c30] hover:bg-[#dce9ff] transition-colors cursor-pointer">
                                <span className="truncate mr-2 font-mono text-xs">
                                    {fileName || "Select a policy PDF..."}
                                </span>
                                <span className="material-symbols-outlined text-[#0a6659] text-[18px]">
                                    cloud_upload
                                </span>
                                <input
                                    type="file"
                                    accept=".pdf"
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                            </label>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                Jurisdiction (optional)
                            </label>
                            <input
                                type="text"
                                value={jurisdiction}
                                onChange={(e) =>
                                    setJurisdiction(e.target.value)
                                }
                                placeholder="e.g. US-CA"
                                className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                            />
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                Version (optional)
                            </label>
                            <input
                                type="text"
                                value={version}
                                onChange={(e) => setVersion(e.target.value)}
                                placeholder="e.g. 2026.1"
                                className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                            />
                        </div>

                        <div className="flex flex-col gap-2 md:col-span-3">
                            <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                Visible To (optional — leave unchecked for whole
                                organization)
                            </label>
                            <div className="flex flex-wrap gap-3">
                                {ALL_ROLES.map((role) => (
                                    <label
                                        key={role}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-xs text-[#0b1c30] cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={allowedRoles.includes(
                                                role,
                                            )}
                                            onChange={() => toggleRole(role)}
                                            className="cursor-pointer"
                                        />
                                        <span className="capitalize">
                                            {role.replace(/_/g, " ")}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-[#E2E8F0] pt-6">
                        <p className="text-xs text-[#57605f] flex items-center gap-2 max-w-2xl">
                            <span className="material-symbols-outlined text-[#0a6659] text-[18px]">
                                info
                            </span>
                            The document is chunked, embedded, and scanned for
                            candidate requirements. It stays in draft until you
                            review and publish it below.
                        </p>

                        <button
                            type="submit"
                            disabled={isUploading || !selectedFile}
                            className="bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-xs cursor-pointer shrink-0"
                        >
                            {isUploading ? (
                                <>
                                    <span className="material-symbols-outlined text-[18px] animate-spin">
                                        sync
                                    </span>
                                    <span>Ingesting...</span>
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">
                                        cloud_upload
                                    </span>
                                    <span>Upload &amp; Ingest</span>
                                </>
                            )}
                        </button>
                    </div>

                    {isUploading && (
                        <div className="p-4 rounded-lg bg-[#f8f9ff] border border-[#E2E8F0] text-xs space-y-1.5">
                            {liveSteps.length === 0 ? (
                                <div className="flex items-center gap-2 text-[#57605f]">
                                    <span className="material-symbols-outlined text-[16px] animate-spin text-[#0a6659]">
                                        neurology
                                    </span>
                                    <span>
                                        Connecting to ingestion pipeline...
                                    </span>
                                </div>
                            ) : (
                                liveSteps.map((step) => (
                                    <div
                                        key={step.step}
                                        className="flex items-center gap-2"
                                    >
                                        <span
                                            className={`material-symbols-outlined text-[16px] ${
                                                step.status === "running"
                                                    ? "animate-spin text-[#0a6659]"
                                                    : step.status === "error"
                                                      ? "text-[#ba1a1a]"
                                                      : "text-[#16a34a]"
                                            }`}
                                        >
                                            {step.status === "running"
                                                ? "sync"
                                                : step.status === "error"
                                                  ? "error"
                                                  : "check_circle"}
                                        </span>
                                        <span
                                            className={
                                                step.status === "done"
                                                    ? "text-[#57605f]"
                                                    : "text-[#0b1c30] font-medium"
                                            }
                                        >
                                            {step.detail ||
                                                STEP_LABELS[step.step] ||
                                                step.step}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {uploadSummary && (
                        <div className="p-4 bg-[#dcfce7] border border-[#bbf7d0] rounded-lg text-sm text-[#166534] space-y-2">
                            <div className="flex items-center gap-2 font-semibold">
                                <span className="material-symbols-outlined text-[20px]">
                                    check_circle
                                </span>
                                Ingestion complete —{" "}
                                {uploadSummary.proposed_requirements ?? 0}{" "}
                                requirement(s) extracted
                            </div>
                            <p className="text-xs text-[#166534]/90">
                                {uploadSummary.chunks ?? 0} chunk(s),{" "}
                                {uploadSummary.embedded ?? 0} embedded,{" "}
                                {uploadSummary.rejected_citations ?? 0}{" "}
                                citation(s) rejected.
                                {uploadSummary.next
                                    ? ` ${uploadSummary.next}.`
                                    : ""}
                            </p>
                            <button
                                onClick={() =>
                                    setReviewPolicyId(
                                        uploadSummary.policy_document_id,
                                    )
                                }
                                className="px-3 py-1.5 bg-[#0a6659] text-white text-xs font-semibold rounded-lg hover:bg-[#004c42] transition-colors cursor-pointer"
                            >
                                Review Requirements
                            </button>
                        </div>
                    )}

                    {uploadError && (
                        <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] rounded-lg text-sm text-[#ba1a1a] flex items-center gap-2">
                            <span className="material-symbols-outlined text-[20px]">
                                error
                            </span>
                            {uploadError}
                        </div>
                    )}
                </form>
            </section>

            {/* Policy List Card */}
            <section className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden flex flex-col">
                <div className="p-6 border-b border-[#E2E8F0] bg-[#f8f9ff]/60">
                    <h2 className="font-heading font-bold text-lg text-[#0b1c30] flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#0a6659] text-[22px]">
                            folder_open
                        </span>
                        Policy Corpus
                    </h2>
                    <p className="text-xs text-[#57605f] mt-1">
                        Uploaded policy documents and their publication status
                    </p>
                </div>

                {supersedeError && (
                    <div className="mx-6 mt-4 p-3 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-xs flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">
                            error
                        </span>
                        <span>{supersedeError}</span>
                    </div>
                )}

                <div className="overflow-x-auto w-full">
                    {isLoadingPolicies ? (
                        <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2">
                            <span className="material-symbols-outlined animate-spin text-[#0a6659]">
                                sync
                            </span>
                            <span>Loading policy documents...</span>
                        </div>
                    ) : listError ? (
                        <div className="p-12 text-center text-[#ba1a1a] text-sm">
                            {listError}
                        </div>
                    ) : policies.length === 0 ? (
                        <div className="p-12 text-center text-[#57605f]">
                            <span className="material-symbols-outlined text-4xl text-[#6f7976] mb-2">
                                description
                            </span>
                            <p className="font-semibold text-[#0b1c30]">
                                No policy documents uploaded yet.
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-[#eff4ff]/60 border-b border-[#E2E8F0] text-xs font-semibold text-[#57605f]">
                                    <th className="py-3.5 px-6">Title</th>
                                    <th className="py-3.5 px-6">Status</th>
                                    <th className="py-3.5 px-6">
                                        Jurisdiction
                                    </th>
                                    <th className="py-3.5 px-6">Version</th>
                                    <th className="py-3.5 px-6">Uploaded</th>
                                    <th className="py-3.5 px-6 text-right">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#E2E8F0] text-sm">
                                {policies.map((p) => (
                                    <tr
                                        key={p.id}
                                        className="hover:bg-[#f8f9ff] transition-colors cursor-pointer"
                                        onClick={() => setReviewPolicyId(p.id)}
                                        title="View extracted requirements and citations"
                                    >
                                        <td className="py-4 px-6 font-medium text-[#0b1c30]">
                                            {p.title}
                                        </td>
                                        <td className="py-4 px-6">
                                            <span
                                                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase border ${STATUS_BADGE[p.status]}`}
                                            >
                                                {p.status}
                                            </span>
                                        </td>
                                        <td className="py-4 px-6 text-[#57605f]">
                                            {p.jurisdiction || "—"}
                                        </td>
                                        <td className="py-4 px-6 text-[#57605f] font-mono text-xs">
                                            {p.version || "—"}
                                        </td>
                                        <td className="py-4 px-6 text-xs text-[#6f7976] whitespace-nowrap">
                                            {new Date(
                                                p.created_at,
                                            ).toLocaleDateString()}
                                        </td>
                                        <td className="py-4 px-6 text-right whitespace-nowrap">
                                            {p.status === "draft" && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReviewPolicyId(p.id);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg border border-[#0a6659] text-[#0a6659] hover:bg-[#0a6659] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                                                >
                                                    Review
                                                </button>
                                            )}
                                            {p.status === "published" && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleSupersede(p.id);
                                                    }}
                                                    className="px-3 py-1.5 rounded-lg border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                                                >
                                                    Supersede
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {reviewPolicyId && (
                <PolicyReviewModal
                    policyDocumentId={reviewPolicyId}
                    onClose={() => setReviewPolicyId(null)}
                    onPublished={() => {
                        setReviewPolicyId(null);
                        loadPolicies();
                    }}
                />
            )}
        </div>
    );
};
