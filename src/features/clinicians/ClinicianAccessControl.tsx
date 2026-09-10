import React from "react";
import type { GrantAccessStatus } from "../../hooks/useGrantAccess";

interface ClinicianAccessControlProps {
  status: GrantAccessStatus;
  error?: string | null;
  onGrant: () => void;
}

// One-shot "Grant Access" control (not a true toggle — see useGrantAccess).
// Always stops click propagation so it's safe inside a clickable table row.
export const ClinicianAccessControl: React.FC<ClinicianAccessControlProps> = ({
  status,
  error,
  onGrant,
}) => {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (status === "idle" || status === "error") onGrant();
  };

  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-[#57605f]">
        <span className="material-symbols-outlined text-[16px] animate-spin text-[#0a6659]">sync</span>
        Granting...
      </span>
    );
  }

  if (status === "granted") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#166534] text-xs font-bold">
        <span className="material-symbols-outlined text-[14px]">check_circle</span>
        Access Granted
      </span>
    );
  }

  if (status === "already_granted") {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#eff4ff] text-[#57605f] text-xs font-semibold border border-[#d3e4fe]">
        <span className="material-symbols-outlined text-[14px]">lock_open</span>
        Already Has Access
      </span>
    );
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={handleClick}
        title={error || "Failed to grant access — click to retry"}
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#ffdad6] text-[#ba1a1a] text-xs font-semibold border border-[#ba1a1a]/30 hover:bg-[#ffc7c2] transition-colors cursor-pointer"
      >
        <span className="material-symbols-outlined text-[14px]">error</span>
        Retry
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#0a6659] text-[#0a6659] text-xs font-semibold hover:bg-[#eff4ff] transition-colors cursor-pointer"
    >
      <span className="material-symbols-outlined text-[14px]">person_add</span>
      Grant Access
    </button>
  );
};
