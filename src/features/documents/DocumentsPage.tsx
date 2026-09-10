import React, { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
    documentsApi,
    cliniciansApi,
    type ReviewQueueCheck,
} from "../../services/api";
import { PolicyManagementPanel } from "./PolicyManagementPanel";
import { hasScope } from "../../auth/scopes";
import { DocumentDetailModal } from "../credentials/DocumentDetailModal";
import { CredentialDetailModal } from "../credentials/CredentialDetailModal";

interface ClinicianOption {
    id: string;
    name: string;
    role: string;
}

// Friendly labels for known credential types; anything the backend returns
// that isn't listed here just falls back to a title-cased version of the code.
const CREDENTIAL_TYPE_LABELS: Record<string, string> = {
    rn_license: "RN License (Registered Nurse)",
    md_license: "MD License (Medical Doctor)",
    dea_registration: "DEA Registration (Controlled Substance)",
    bls: "BLS (Basic Life Support)",
    acls: "ACLS (Advanced Cardiac Life Support)",
    hipaa_training: "HIPAA Training (Annual Security)",
    vaccination: "Vaccination (Immunization Record)",
    other: "Other",
};

// Fallback list shown before a clinician is selected, or if that clinician
// has no resolved requirements yet (e.g. no policy published for their role/jurisdiction).
const ALL_CREDENTIAL_TYPES = Object.keys(CREDENTIAL_TYPE_LABELS);

function credentialTypeLabel(type: string): string {
    return CREDENTIAL_TYPE_LABELS[type] || type.replace(/_/g, " ");
}

export const DocumentsPage: React.FC = () => {
    const { user } = useAuth();
    const canManagePolicies = hasScope(user?.role, "compliance:report");
    // GET /document-checks/review-queue and POST /document-checks/{id}/review are
    // both documents:update. A clinician 403s on the fetch, which used to surface
    // as an empty queue reading "all resolved".
    const canReviewChecks = hasScope(user?.role, "documents:update");
    // Deep link from a clinician's detail page: preselect that clinician so the
    // Upload Document button there lands on a form already pointed at them.
    const [searchParams] = useSearchParams();
    const deepLinkedClinicianId = searchParams.get("clinicianId");
    const [activeTab, setActiveTab] = useState<"credentials" | "policies">(
        "credentials",
    );
    const [clinicians, setClinicians] = useState<ClinicianOption[]>([]);
    const [selectedClinicianId, setSelectedClinicianId] = useState(
        deepLinkedClinicianId || "",
    );
    const [credentialType, setCredentialType] = useState("rn_license");
    const [requiredCredentialTypes, setRequiredCredentialTypes] = useState<
        string[]
    >([]);
    const [loadingRequirements, setLoadingRequirements] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [fileName, setFileName] = useState("");
    const [isUploading, setIsUploading] = useState(false);
    const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [reviewQueue, setReviewQueue] = useState<ReviewQueueCheck[]>([]);
    const [isLoadingQueue, setIsLoadingQueue] = useState(true);
    const [actionError, setActionError] = useState<string | null>(null);
    const [openDocumentId, setOpenDocumentId] = useState<string | null>(null);
    const [openCredentialId, setOpenCredentialId] = useState<string | null>(
        null,
    );

    useEffect(() => {
        async function loadData() {
            if (user?.orgId) {
                try {
                    const list = await cliniciansApi.listClinicians(user.orgId);
                    const mapped: ClinicianOption[] = list.map((c: any) => ({
                        id: c.clinician_id || c.id,
                        name: c.full_name || c.name || "Unnamed Clinician",
                        role: c.role || "Clinician",
                    }));
                    setClinicians(mapped);
                    if (!deepLinkedClinicianId && mapped.length > 0) {
                        setSelectedClinicianId(mapped[0].id);
                    }
                } catch {
                    // Fallback if clinicians list fails
                }
            }

            // Load review queue
            if (!canReviewChecks) {
                setIsLoadingQueue(false);
                return;
            }
            try {
                setIsLoadingQueue(true);
                const data = await documentsApi.getReviewQueue();
                setReviewQueue(data.checks || []);
            } catch (err: any) {
                console.error("Failed to load review queue:", err);
            } finally {
                setIsLoadingQueue(false);
            }
        }

        loadData();
    }, [user, deepLinkedClinicianId]);

    // Load which credential types are actually required for the selected
    // clinician's role + jurisdiction (the compliance engine already resolves
    // this server-side) so the Credential Type dropdown only shows relevant options.
    useEffect(() => {
        if (!selectedClinicianId) {
            setRequiredCredentialTypes([]);
            return;
        }

        let cancelled = false;
        async function loadRequiredTypes() {
            setLoadingRequirements(true);
            try {
                const status =
                    await cliniciansApi.getComplianceStatus(
                        selectedClinicianId,
                    );
                const types = Array.from(
                    new Set(
                        (status.findings || [])
                            .map((f) => f.credential_type)
                            .filter((t): t is string => !!t),
                    ),
                );
                if (cancelled) return;
                setRequiredCredentialTypes(types);
                if (status.clinician) {
                    setClinicians((prev) =>
                        prev.some((c) => c.id === selectedClinicianId)
                            ? prev
                            : [
                                  ...prev,
                                  {
                                      id: selectedClinicianId,
                                      name:
                                          status.clinician.full_name ||
                                          "Clinician",
                                      role: status.clinician.role || "Clinician",
                                  },
                              ],
                    );
                }
            } catch {
                if (!cancelled) setRequiredCredentialTypes([]);
            } finally {
                if (!cancelled) setLoadingRequirements(false);
            }
        }

        loadRequiredTypes();
        return () => {
            cancelled = true;
        };
    }, [selectedClinicianId]);

    // Keep the selected credential type valid whenever the required-types list changes.
    useEffect(() => {
        if (
            requiredCredentialTypes.length > 0 &&
            !requiredCredentialTypes.includes(credentialType)
        ) {
            setCredentialType(requiredCredentialTypes[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [requiredCredentialTypes]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setSelectedFile(file);
            setFileName(file.name);
        }
    };

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedClinicianId) {
            setUploadError("Please select a clinician");
            return;
        }

        let fileToUpload = selectedFile;
        if (!fileToUpload) {
            // Create a dummy PDF file if none selected to demonstrate upload
            const dummyContent = new Blob(
                ["%PDF-1.4 Mock Credential Document for OCR"],
                { type: "application/pdf" },
            );
            fileToUpload = new File(
                [dummyContent],
                fileName || "credential_upload.pdf",
                { type: "application/pdf" },
            );
        }

        setIsUploading(true);
        setUploadSuccess(null);
        setUploadError(null);

        try {
            const res = await documentsApi.upload(
                selectedClinicianId,
                fileToUpload,
                credentialType,
            );
            setUploadSuccess(
                `Document uploaded successfully! Document ID: ${res.document_id || "Processed"}. Status: ${res.status || "Verified"}.`,
            );
            setSelectedFile(null);
            setFileName("");

            // Refresh review queue
            const queueData = await documentsApi.getReviewQueue();
            setReviewQueue(queueData.checks || []);

            // Auto-open the document detail modal so the user sees OCR results immediately
            if (res.document_id) {
                setOpenDocumentId(res.document_id);
            }
        } catch (err: any) {
            setUploadError(
                err.message || "Failed to upload document to backend",
            );
        } finally {
            setIsUploading(false);
        }
    };

    const handleAction = async (id: string, action: "approve" | "reject") => {
        try {
            setActionError(null);
            await documentsApi.reviewCheck(id, action);
            setReviewQueue((prev) => prev.filter((item) => item.id !== id));
        } catch (err: any) {
            setActionError(err.message || `Failed to submit review ${action}`);
        }
    };

    const pendingCount = reviewQueue.length;

    return (
        <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
            {/* Page Header */}
            <div>
                <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#0b1c30]">
                    Documents &amp; AI Review Queue
                </h1>
                <p className="text-sm text-[#57605f] mt-1">
                    Upload credential certifications for multi-modal OCR
                    extraction &amp; resolve escalated verification checks
                </p>
            </div>

            {actionError && (
                <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-xl flex items-center gap-3 text-sm">
                    <span className="material-symbols-outlined text-[20px]">
                        error
                    </span>
                    <span>{actionError}</span>
                </div>
            )}

            {/* Tab Switcher */}
            {canManagePolicies && (
                <div className="inline-flex items-center gap-1 p-1 bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg">
                    <button
                        onClick={() => setActiveTab("credentials")}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                            activeTab === "credentials"
                                ? "bg-white text-[#0a6659] shadow-xs"
                                : "text-[#57605f] hover:text-[#0b1c30]"
                        }`}
                    >
                        Credential Documents
                    </button>
                    <button
                        onClick={() => setActiveTab("policies")}
                        className={`px-4 py-2 rounded-md text-sm font-semibold transition-colors cursor-pointer ${
                            activeTab === "policies"
                                ? "bg-white text-[#0a6659] shadow-xs"
                                : "text-[#57605f] hover:text-[#0b1c30]"
                        }`}
                    >
                        Policy Documents
                    </button>
                </div>
            )}

            {activeTab === "policies" && canManagePolicies ? (
                <PolicyManagementPanel />
            ) : (
                <>
                    {/* Upload Card */}
                    <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 md:p-8 shadow-xs">
                        <h2 className="font-heading font-bold text-lg text-[#0b1c30] mb-6 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[#0a6659] text-[22px]">
                                upload_file
                            </span>
                            Upload Credential Document
                        </h2>

                        <form onSubmit={handleUpload}>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                                {/* Clinician Dropdown */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                        Clinician
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={selectedClinicianId}
                                            onChange={(e) =>
                                                setSelectedClinicianId(
                                                    e.target.value,
                                                )
                                            }
                                            className="w-full appearance-none bg-[#f8f9ff] border border-[#CBD5E1] rounded-lg py-3 px-4 text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all cursor-pointer pr-10"
                                        >
                                            {clinicians.length === 0 ? (
                                                <option value="">
                                                    Loading clinicians from
                                                    backend...
                                                </option>
                                            ) : (
                                                clinicians.map((c) => (
                                                    <option
                                                        key={c.id}
                                                        value={c.id}
                                                    >
                                                        {c.name} — {c.role}
                                                    </option>
                                                ))
                                            )}
                                        </select>
                                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#6f7976]">
                                            <span className="material-symbols-outlined text-[20px]">
                                                expand_more
                                            </span>
                                        </span>
                                    </div>
                                </div>

                                {/* Credential Type Dropdown */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                        Credential Type
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={credentialType}
                                            onChange={(e) =>
                                                setCredentialType(
                                                    e.target.value,
                                                )
                                            }
                                            disabled={loadingRequirements}
                                            className="w-full appearance-none bg-[#f8f9ff] border border-[#CBD5E1] rounded-lg py-3 px-4 text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all cursor-pointer pr-10 disabled:opacity-60"
                                        >
                                            {(requiredCredentialTypes.length > 0
                                                ? requiredCredentialTypes
                                                : ALL_CREDENTIAL_TYPES
                                            ).map((type) => (
                                                <option key={type} value={type}>
                                                    {credentialTypeLabel(type)}
                                                </option>
                                            ))}
                                        </select>
                                        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#6f7976]">
                                            <span className="material-symbols-outlined text-[20px]">
                                                expand_more
                                            </span>
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-[#6f7976]">
                                        {loadingRequirements
                                            ? "Loading required credential types for this clinician..."
                                            : requiredCredentialTypes.length > 0
                                              ? `Showing ${requiredCredentialTypes.length} type(s) required for this clinician's role & jurisdiction`
                                              : selectedClinicianId
                                                ? "No specific requirements resolved yet — showing all credential types"
                                                : "Select a clinician to see their required credential types"}
                                    </p>
                                </div>

                                {/* File Picker */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
                                        File (PDF, PNG, JPG)
                                    </label>
                                    <label className="w-full flex items-center justify-between bg-[#eff4ff] border border-[#CBD5E1] border-dashed rounded-lg py-3 px-4 text-sm text-[#0b1c30] hover:bg-[#dce9ff] transition-colors cursor-pointer">
                                        <span className="truncate mr-2 font-mono text-xs">
                                            {fileName ||
                                                "Select document to upload..."}
                                        </span>
                                        <span className="material-symbols-outlined text-[#0a6659] text-[18px]">
                                            cloud_upload
                                        </span>
                                        <input
                                            type="file"
                                            accept=".pdf,.png,.jpg,.jpeg"
                                            className="hidden"
                                            onChange={handleFileChange}
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Banner & Action */}
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-t border-[#E2E8F0] pt-6">
                                <p className="text-xs text-[#57605f] flex items-center gap-2 max-w-2xl">
                                    <span className="material-symbols-outlined text-[#0a6659] text-[18px]">
                                        info
                                    </span>
                                    AI pipeline will extract fields, perform
                                    tamper checks, and query the State Registry
                                    automatically.
                                </p>

                                <button
                                    type="submit"
                                    disabled={
                                        isUploading ||
                                        !selectedClinicianId ||
                                        !selectedFile
                                    }
                                    className="bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
                                >
                                    {isUploading ? (
                                        <>
                                            <span className="material-symbols-outlined text-[18px] animate-spin">
                                                sync
                                            </span>
                                            <span>
                                                Processing OCR &amp;
                                                Verification...
                                            </span>
                                        </>
                                    ) : (
                                        <>
                                            <span className="material-symbols-outlined text-[18px]">
                                                cloud_upload
                                            </span>
                                            <span>Upload &amp; Verify</span>
                                        </>
                                    )}
                                </button>
                            </div>

                            {uploadSuccess && (
                                <div className="mt-4 p-4 bg-[#dcfce7] border border-[#bbf7d0] rounded-lg text-sm text-[#166534] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[20px]">
                                        check_circle
                                    </span>
                                    {uploadSuccess}
                                </div>
                            )}

                            {uploadError && (
                                <div className="mt-4 p-4 bg-[#ffdad6] border border-[#ba1a1a] rounded-lg text-sm text-[#ba1a1a] flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[20px]">
                                        error
                                    </span>
                                    {uploadError}
                                </div>
                            )}
                        </form>
                    </section>

                    {/* Review Queue Card — documents:update only */}
                    {canReviewChecks && (
                        <section className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden flex flex-col">
                            {/* Header */}
                            <div className="p-6 border-b border-[#E2E8F0] bg-[#f8f9ff]/60 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <div className="flex items-center gap-3">
                                        <h2 className="font-heading font-bold text-lg text-[#0b1c30] flex items-center gap-2">
                                            <span className="material-symbols-outlined text-[#884934] text-[22px]">
                                                rule
                                            </span>
                                            AI Review Queue
                                        </h2>
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-[#ffdbd0] text-[#703623] text-xs font-bold">
                                            {pendingCount} pending
                                        </span>
                                    </div>
                                    <p className="text-xs text-[#57605f] mt-1">
                                        Document checks scored below confidence
                                        threshold requiring Human-in-the-Loop
                                        decision
                                    </p>
                                </div>
                            </div>

                            {/* Table */}
                            <div className="overflow-x-auto w-full">
                                {isLoadingQueue ? (
                                    <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2">
                                        <span className="material-symbols-outlined animate-spin text-[#0a6659]">
                                            sync
                                        </span>
                                        <span>
                                            Loading review queue from live
                                            backend...
                                        </span>
                                    </div>
                                ) : reviewQueue.length === 0 ? (
                                    <div className="p-12 text-center text-[#57605f]">
                                        <span className="material-symbols-outlined text-4xl text-emerald-600 mb-2">
                                            task_alt
                                        </span>
                                        <p className="font-semibold text-[#0b1c30]">
                                            All pending review checks are
                                            resolved!
                                        </p>
                                        <p className="text-xs text-[#6f7976] mt-1">
                                            No items currently below confidence
                                            threshold in the live queue.
                                        </p>
                                    </div>
                                ) : (
                                    <table className="w-full text-left border-collapse min-w-[950px]">
                                        <thead>
                                            <tr className="bg-[#eff4ff]/60 border-b border-[#E2E8F0] text-xs font-semibold text-[#57605f]">
                                                <th className="py-3.5 px-6">
                                                    Clinician
                                                </th>
                                                <th className="py-3.5 px-6">
                                                    Document
                                                </th>
                                                <th className="py-3.5 px-6">
                                                    Check Type
                                                </th>
                                                <th className="py-3.5 px-6 w-1/4">
                                                    AI Finding
                                                </th>
                                                <th className="py-3.5 px-6">
                                                    Confidence
                                                </th>
                                                <th className="py-3.5 px-6">
                                                    Submitted
                                                </th>
                                                <th className="py-3.5 px-6 text-right">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-[#E2E8F0] text-sm">
                                            {reviewQueue.map((row) => {
                                                const score =
                                                    row.confidence_score ??
                                                    row.score ??
                                                    50;
                                                return (
                                                    <tr
                                                        key={row.id}
                                                        onClick={() =>
                                                            row.document_id &&
                                                            setOpenDocumentId(
                                                                row.document_id,
                                                            )
                                                        }
                                                        className={`hover:bg-[#f8f9ff] transition-colors ${row.document_id ? "cursor-pointer" : ""}`}
                                                    >
                                                        <td className="py-4 px-6 font-medium text-[#0b1c30] whitespace-nowrap">
                                                            {row.clinician_name ||
                                                                row.clinician_id ||
                                                                "Clinician"}
                                                        </td>

                                                        <td className="py-4 px-6 text-[#57605f] whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <span className="material-symbols-outlined text-[#6f7976] text-[18px]">
                                                                    {(
                                                                        row.document_name ||
                                                                        ""
                                                                    ).endsWith(
                                                                        ".pdf",
                                                                    )
                                                                        ? "picture_as_pdf"
                                                                        : "image"}
                                                                </span>
                                                                <span className="font-mono text-xs">
                                                                    {row.document_name ||
                                                                        row.document_id ||
                                                                        "document"}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        <td className="py-4 px-6 text-[#0b1c30] whitespace-nowrap font-medium capitalize">
                                                            {(
                                                                row.check_type ||
                                                                ""
                                                            ).replace("_", " ")}
                                                        </td>

                                                        <td className="py-4 px-6 text-xs text-[#ba1a1a]">
                                                            <div className="flex items-start gap-1.5 font-medium">
                                                                <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">
                                                                    warning
                                                                </span>
                                                                <span>
                                                                    {row.ai_finding ||
                                                                        row.finding ||
                                                                        "Needs manual verification review"}
                                                                </span>
                                                            </div>
                                                        </td>

                                                        <td className="py-4 px-6 whitespace-nowrap">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 h-1.5 bg-[#d8e2e0] rounded-full overflow-hidden">
                                                                    <div
                                                                        className={`h-full ${
                                                                            score <
                                                                            65
                                                                                ? "bg-[#ba1a1a]"
                                                                                : score <
                                                                                    75
                                                                                  ? "bg-[#d97706]"
                                                                                  : "bg-[#16a34a]"
                                                                        }`}
                                                                        style={{
                                                                            width: `${score}%`,
                                                                        }}
                                                                    ></div>
                                                                </div>
                                                                <span
                                                                    className={`text-xs font-bold ${
                                                                        score <
                                                                        65
                                                                            ? "text-[#ba1a1a]"
                                                                            : score <
                                                                                75
                                                                              ? "text-[#d97706]"
                                                                              : "text-[#16a34a]"
                                                                    }`}
                                                                >
                                                                    {score}%
                                                                </span>
                                                            </div>
                                                        </td>

                                                        <td className="py-4 px-6 text-xs text-[#6f7976] whitespace-nowrap">
                                                            {row.submitted_ago ||
                                                                (row.created_at
                                                                    ? new Date(
                                                                          row.created_at,
                                                                      ).toLocaleDateString()
                                                                    : "Just now")}
                                                        </td>

                                                        <td className="py-4 px-6 text-right whitespace-nowrap">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <button
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        handleAction(
                                                                            row.id,
                                                                            "approve",
                                                                        );
                                                                    }}
                                                                    className="px-3 py-1.5 rounded-lg border border-[#0a6659] text-[#0a6659] hover:bg-[#0a6659] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    Approve
                                                                </button>
                                                                <button
                                                                    onClick={(
                                                                        e,
                                                                    ) => {
                                                                        e.stopPropagation();
                                                                        handleAction(
                                                                            row.id,
                                                                            "reject",
                                                                        );
                                                                    }}
                                                                    className="px-3 py-1.5 rounded-lg border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ba1a1a] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                                                                >
                                                                    Reject
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </section>
                    )}
                </>
            )}

            {openDocumentId && !openCredentialId && (
                <DocumentDetailModal
                    documentId={openDocumentId}
                    onClose={() => setOpenDocumentId(null)}
                    onOpenCredential={(credentialId) => {
                        setOpenCredentialId(credentialId);
                    }}
                    onReviewChange={async () => {
                        const queueData = await documentsApi.getReviewQueue();
                        setReviewQueue(queueData.checks || []);
                    }}
                />
            )}

            {openCredentialId && (
                <CredentialDetailModal
                    credentialId={openCredentialId}
                    onClose={() => {
                        setOpenCredentialId(null);
                        setOpenDocumentId(null);
                    }}
                    onBack={
                        openDocumentId
                            ? () => setOpenCredentialId(null)
                            : undefined
                    }
                />
            )}
        </div>
    );
};
