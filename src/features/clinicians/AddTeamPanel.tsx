import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  teamApi,
  type ClinicianCreateInput,
  type ClinicianCreateResult,
  type StaffUserCreateInput,
  type StaffUserCreateResult
} from '../../services/api';

type ProvisionResult =
  | { kind: 'clinicians'; items: ClinicianCreateResult[] }
  | { kind: 'users'; items: StaffUserCreateResult[] };

const CLINICAL_ROLES: ClinicianCreateInput['clinical_role'][] = [
  'nurse',
  'physician',
  'technician',
  'therapist',
  'pharmacist',
  'other'
];

const emptyClinicianRow = (): ClinicianCreateInput => ({
  full_name: '',
  clinical_role: 'nurse',
  jurisdiction: '',
  npi: '',
  email: ''
});

const emptyUserRow = (): StaffUserCreateInput => ({
  full_name: '',
  email: '',
  role: 'hr'
});

const inputClass =
  'w-full h-10 px-3 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all';

export const AddTeamPanel: React.FC = () => {
  const { user } = useAuth();
  const canAddClinicians = user?.role === 'admin' || user?.role === 'hr';
  const canAddUsers = user?.role === 'admin';

  const [clinicianRows, setClinicianRows] = useState<ClinicianCreateInput[]>([emptyClinicianRow()]);
  const [isSubmittingClinicians, setIsSubmittingClinicians] = useState(false);
  const [clinicianError, setClinicianError] = useState<string | null>(null);

  const [userRows, setUserRows] = useState<StaffUserCreateInput[]>([emptyUserRow()]);
  const [isSubmittingUsers, setIsSubmittingUsers] = useState(false);
  const [userError, setUserError] = useState<string | null>(null);

  const [results, setResults] = useState<ProvisionResult | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const updateClinicianRow = (idx: number, patch: Partial<ClinicianCreateInput>) => {
    setClinicianRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const updateUserRow = (idx: number, patch: Partial<StaffUserCreateInput>) => {
    setUserRows((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  };

  const handleSubmitClinicians = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.orgId) {
      setClinicianError('No organization context available for this account');
      return;
    }
    if (clinicianRows.some((r) => !r.full_name.trim())) {
      setClinicianError('Every clinician row needs a full name');
      return;
    }

    setIsSubmittingClinicians(true);
    setClinicianError(null);
    try {
      const payload = clinicianRows.map((r) => ({
        full_name: r.full_name.trim(),
        clinical_role: r.clinical_role,
        jurisdiction: r.jurisdiction?.trim() || undefined,
        npi: r.npi?.trim() || undefined,
        email: r.email?.trim() || undefined
      }));
      const created = await teamApi.addClinicians(user.orgId, payload);
      setResults({ kind: 'clinicians', items: created });
      setClinicianRows([emptyClinicianRow()]);
    } catch (err: any) {
      setClinicianError(err.message || 'Failed to add clinicians');
    } finally {
      setIsSubmittingClinicians(false);
    }
  };

  const handleSubmitUsers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.orgId) {
      setUserError('No organization context available for this account');
      return;
    }
    if (userRows.some((r) => !r.full_name.trim() || !r.email.trim())) {
      setUserError('Every user row needs a full name and email');
      return;
    }

    setIsSubmittingUsers(true);
    setUserError(null);
    try {
      const payload = userRows.map((r) => ({
        full_name: r.full_name.trim(),
        email: r.email.trim(),
        role: r.role
      }));
      const created = await teamApi.addUsers(user.orgId, payload);
      setResults({ kind: 'users', items: created });
      setUserRows([emptyUserRow()]);
    } catch (err: any) {
      setUserError(err.message || 'Failed to add staff users');
    } finally {
      setIsSubmittingUsers(false);
    }
  };

  const copyPassword = (password: string, idx: number) => {
    navigator.clipboard.writeText(password);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex((current) => (current === idx ? null : current)), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Add Clinicians */}
      {canAddClinicians && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 md:p-8 shadow-xs">
          <h2 className="font-heading font-bold text-lg text-[#0b1c30] mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0a6659] text-[22px]">medical_information</span>
            Add Clinicians
          </h2>
          <p className="text-xs text-[#57605f] mb-6">
            Creates each clinician's profile and a linked login in one batch. Leave email blank to auto-generate one.
          </p>

          <form onSubmit={handleSubmitClinicians} className="space-y-4">
            {clinicianRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start p-3 rounded-lg bg-[#f8f9ff]/60 border border-[#E2E8F0]">
                <div className="md:col-span-3">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Full Name *</label>
                  <input
                    type="text"
                    value={row.full_name}
                    onChange={(e) => updateClinicianRow(idx, { full_name: e.target.value })}
                    placeholder="e.g. Sandra Okafor"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Clinical Role</label>
                  <select
                    value={row.clinical_role}
                    onChange={(e) => updateClinicianRow(idx, { clinical_role: e.target.value as ClinicianCreateInput['clinical_role'] })}
                    className={`${inputClass} cursor-pointer`}
                  >
                    {CLINICAL_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Jurisdiction</label>
                  <input
                    type="text"
                    value={row.jurisdiction}
                    onChange={(e) => updateClinicianRow(idx, { jurisdiction: e.target.value })}
                    placeholder="US-CA"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">NPI</label>
                  <input
                    type="text"
                    value={row.npi}
                    onChange={(e) => updateClinicianRow(idx, { npi: e.target.value })}
                    placeholder="Optional"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Login Email</label>
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateClinicianRow(idx, { email: e.target.value })}
                    placeholder="Auto-generated"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-1 flex md:justify-end pt-5">
                  <button
                    type="button"
                    onClick={() => setClinicianRows((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={clinicianRows.length === 1}
                    className="text-[#ba1a1a] hover:bg-[#ffdad6] disabled:opacity-30 disabled:cursor-not-allowed rounded-lg p-2 cursor-pointer"
                    title="Remove row"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => setClinicianRows((prev) => [...prev, emptyClinicianRow()])}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eff4ff] hover:bg-[#d3e4fe] text-[#0a6659] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add Row
              </button>

              <button
                type="submit"
                disabled={isSubmittingClinicians}
                className="bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isSubmittingClinicians ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                    <span>Provisioning...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    <span>Add {clinicianRows.length > 1 ? `${clinicianRows.length} Clinicians` : 'Clinician'}</span>
                  </>
                )}
              </button>
            </div>

            {clinicianError && (
              <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] rounded-lg text-sm text-[#ba1a1a] flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">error</span>
                {clinicianError}
              </div>
            )}
          </form>
        </section>
      )}

      {/* Add Staff Users */}
      {canAddUsers && (
        <section className="bg-white border border-[#E2E8F0] rounded-xl p-6 md:p-8 shadow-xs">
          <h2 className="font-heading font-bold text-lg text-[#0b1c30] mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[#0a6659] text-[22px]">badge</span>
            Add Staff Users
          </h2>
          <p className="text-xs text-[#57605f] mb-6">
            Creates HR or Compliance Officer logins for this organization.
          </p>

          <form onSubmit={handleSubmitUsers} className="space-y-4">
            {userRows.map((row, idx) => (
              <div key={idx} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start p-3 rounded-lg bg-[#f8f9ff]/60 border border-[#E2E8F0]">
                <div className="md:col-span-4">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Full Name *</label>
                  <input
                    type="text"
                    value={row.full_name}
                    onChange={(e) => updateUserRow(idx, { full_name: e.target.value })}
                    placeholder="e.g. Marcus Vance"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-4">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Email *</label>
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => updateUserRow(idx, { email: e.target.value })}
                    placeholder="name@org.com"
                    className={inputClass}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-[10px] font-semibold text-[#57605f] uppercase tracking-wider">Role</label>
                  <select
                    value={row.role}
                    onChange={(e) => updateUserRow(idx, { role: e.target.value as StaffUserCreateInput['role'] })}
                    className={`${inputClass} cursor-pointer`}
                  >
                    <option value="hr">HR</option>
                    <option value="compliance_officer">Compliance Officer</option>
                  </select>
                </div>
                <div className="md:col-span-1 flex md:justify-end pt-5">
                  <button
                    type="button"
                    onClick={() => setUserRows((prev) => prev.filter((_, i) => i !== idx))}
                    disabled={userRows.length === 1}
                    className="text-[#ba1a1a] hover:bg-[#ffdad6] disabled:opacity-30 disabled:cursor-not-allowed rounded-lg p-2 cursor-pointer"
                    title="Remove row"
                  >
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-2">
              <button
                type="button"
                onClick={() => setUserRows((prev) => [...prev, emptyUserRow()])}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#eff4ff] hover:bg-[#d3e4fe] text-[#0a6659] text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                Add Row
              </button>

              <button
                type="submit"
                disabled={isSubmittingUsers}
                className="bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-xs cursor-pointer"
              >
                {isSubmittingUsers ? (
                  <>
                    <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                    <span>Provisioning...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">person_add</span>
                    <span>Add {userRows.length > 1 ? `${userRows.length} Users` : 'User'}</span>
                  </>
                )}
              </button>
            </div>

            {userError && (
              <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] rounded-lg text-sm text-[#ba1a1a] flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px]">error</span>
                {userError}
              </div>
            )}
          </form>
        </section>
      )}

      {/* Results Modal */}
      {results && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] p-6 md:p-8 shadow-2xl border border-[#CBD5E1] flex flex-col">
            <div className="flex items-center gap-3 mb-4 shrink-0">
              <div className="w-12 h-12 rounded-full bg-[#dcfce7] flex items-center justify-center text-[#166534]">
                <span className="material-symbols-outlined text-[28px]">how_to_reg</span>
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-[#0b1c30]">
                  {results.kind === 'clinicians' ? 'Clinicians Provisioned!' : 'Staff Users Provisioned!'}
                </h3>
                <p className="text-xs text-[#57605f]">
                  Copy each generated password now — it won't be shown again here.
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {results.items.map((item, idx) => (
                <div key={idx} className="bg-[#f8f9ff] border border-[#CBD5E1] rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0b1c30] truncate">{item.email}</p>
                    <p className="text-[11px] text-[#6f7976] uppercase tracking-wider">{item.status}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-sm text-[#0a6659] bg-white border border-[#CBD5E1] rounded-lg px-3 py-2">
                      {item.password}
                    </span>
                    <button
                      onClick={() => copyPassword(item.password, idx)}
                      className="flex items-center gap-1 text-[#0a6659] hover:underline font-semibold text-xs cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {copiedIndex === idx ? 'done' : 'content_copy'}
                      </span>
                      <span>{copiedIndex === idx ? 'Copied!' : 'Copy'}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-4 mt-2 border-t border-[#E2E8F0] shrink-0">
              <button
                onClick={() => setResults(null)}
                className="px-6 py-2.5 bg-[#0a6659] text-white rounded-lg text-xs font-semibold hover:bg-[#004c42] transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
