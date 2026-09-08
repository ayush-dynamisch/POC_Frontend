import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { cliniciansApi, credentialsApi, type ClinicianComplianceStatus } from '../../services/api';

export const ClinicianStatusPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [cliniciansList, setCliniciansList] = useState<{ id: string; name: string; role: string }[]>([]);
  const [selectedClinicianId, setSelectedClinicianId] = useState<string>('');
  const [statusData, setStatusData] = useState<ClinicianComplianceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filter, setFilter] = useState<'all' | 'satisfied' | 'expiring' | 'non_compliant'>('all');
  const [activeModal, setActiveModal] = useState<{
    type: 'reverify' | 'override';
    item?: any;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Load clinicians list for org
  useEffect(() => {
    async function loadClinicians() {
      if (!user?.orgId) return;
      try {
        const list = await cliniciansApi.listClinicians(user.orgId);
        const mapped = list.map((c: any) => ({
          id: c.clinician_id || c.id,
          name: c.full_name || c.name || 'Clinician',
          role: c.role || 'nurse'
        }));
        setCliniciansList(mapped);

        // Determine current clinician ID
        const urlId = searchParams.get('id');
        if (urlId && mapped.some(m => m.id === urlId)) {
          setSelectedClinicianId(urlId);
        } else if (mapped.length > 0) {
          setSelectedClinicianId(mapped[0].id);
          setSearchParams({ id: mapped[0].id });
        }
      } catch (err: any) {
        console.error('Failed to load clinicians list:', err);
      }
    }

    loadClinicians();
  }, [user, searchParams, setSearchParams]);

  // Load compliance status for selected clinician
  useEffect(() => {
    if (!selectedClinicianId) return;

    async function loadCompliance() {
      try {
        setLoading(true);
        setError(null);
        const data = await cliniciansApi.getComplianceStatus(selectedClinicianId);
        setStatusData(data);
      } catch (err: any) {
        setError(err.message || 'Failed to load clinician compliance status');
      } finally {
        setLoading(false);
      }
    }

    loadCompliance();
  }, [selectedClinicianId]);

  const handleClinicianChange = (id: string) => {
    setSelectedClinicianId(id);
    setSearchParams({ id });
  };

  const handleReverify = async (item: any) => {
    if (!item.credential_id) {
      setNotification(`Cannot re-verify: requirement has no submitted credential document yet.`);
      setActiveModal(null);
      return;
    }

    setIsProcessing(true);
    try {
      const res = await credentialsApi.reverify(item.credential_id);
      setNotification(`Re-verification dispatched. Authority status: ${res.authority_status || 'verified'}`);
      // Refresh status
      const updated = await cliniciansApi.getComplianceStatus(selectedClinicianId);
      setStatusData(updated);
    } catch (err: any) {
      setNotification(`Re-verification notice: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setActiveModal(null);
    }
  };

  const handleOverrideSubmit = async (item: any) => {
    if (!item.credential_id) {
      setNotification(`Cannot override: requirement has no submitted credential.`);
      setActiveModal(null);
      return;
    }

    setIsProcessing(true);
    try {
      await credentialsApi.review(item.credential_id, 'approved', overrideReason);
      setNotification(`Override approved for ${item.title || item.credential_type}. Live compliance updated.`);
      // Refresh status
      const updated = await cliniciansApi.getComplianceStatus(selectedClinicianId);
      setStatusData(updated);
    } catch (err: any) {
      setNotification(`Review failed: ${err.message}`);
    } finally {
      setIsProcessing(false);
      setActiveModal(null);
      setOverrideReason('');
    }
  };

  const findings = statusData?.findings || [];

  const filteredFindings = findings.filter((f) => {
    const status = f.status || f.state || '';
    if (filter === 'satisfied') return status === 'satisfied' || status === 'verified';
    if (filter === 'expiring') return status === 'expiring_soon';
    if (filter === 'non_compliant') return status === 'expired' || status === 'missing' || status === 'rejected';
    return true;
  });

  const isCompliant = statusData?.summary?.compliant ?? false;
  const clinicianName = statusData?.clinician?.full_name || 'Clinician Record';
  const clinicianRole = statusData?.clinician?.role || 'nurse';
  const clinicianInitials = clinicianName
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase() || 'CR';

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {notification && (
        <div className="p-4 bg-[#dcfce7] border border-[#bbf7d0] text-[#166534] rounded-xl flex items-center gap-3 shadow-sm text-sm">
          <span className="material-symbols-outlined text-[20px]">verified</span>
          <span className="flex-1 font-medium">{typeof notification === 'string' ? notification : JSON.stringify(notification)}</span>
          <button onClick={() => setNotification(null)} className="text-[#166534] hover:opacity-75 cursor-pointer">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-xl flex items-center gap-3 text-sm">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span>{typeof error === 'string' ? error : JSON.stringify(error)}</span>
        </div>
      )}

      {/* Clinician Selector Bar */}
      {cliniciansList.length > 1 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-[#57605f] uppercase tracking-wider">
              Selected Clinician:
            </span>
            <select
              value={selectedClinicianId}
              onChange={(e) => handleClinicianChange(e.target.value)}
              className="bg-[#f8f9ff] border border-[#CBD5E1] rounded-lg py-1.5 px-3 text-sm font-medium text-[#0b1c30] focus:outline-none focus:border-[#0a6659] cursor-pointer"
            >
              {cliniciansList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.role})
                </option>
              ))}
            </select>
          </div>
          <span className="text-xs text-[#6f7976]">
            {cliniciansList.length} total clinicians in organization
          </span>
        </div>
      )}

      {/* TOP CARD: Clinician Profile Summary */}
      <section className="bg-white rounded-xl border border-[#E2E8F0] p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 shadow-xs">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full bg-[#0a6659] text-white flex items-center justify-center font-heading font-bold text-2xl shadow-inner shrink-0">
            {clinicianInitials}
          </div>
          <div>
            <h1 className="font-heading font-bold text-2xl text-[#0b1c30] flex items-center gap-3">
              {clinicianName}
              <span className="text-xs font-normal text-[#6f7976] bg-[#eff4ff] px-2.5 py-0.5 rounded-full border border-[#d3e4fe]">
                ID: {selectedClinicianId ? `${selectedClinicianId.substring(0, 8)}...` : 'N/A'}
              </span>
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-[#57605f] mt-2">
              <span className="flex items-center gap-1.5 font-medium capitalize">
                <span className="material-symbols-outlined text-[18px] text-[#0a6659]">badge</span>
                {clinicianRole}
              </span>
              <span className="text-[#CBD5E1]">•</span>
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[18px] text-[#0a6659]">local_hospital</span>
                {statusData?.clinician?.jurisdiction ? `Jurisdiction: ${statusData.clinician.jurisdiction}` : 'Universal Tenant Scope'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 self-end md:self-center">
          <div
            className={`px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs uppercase tracking-wider ${
              isCompliant ? 'bg-[#16a34a] text-white' : 'bg-[#ba1a1a] text-white'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isCompliant ? 'check_circle' : 'warning'}
            </span>
            {isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}
          </div>
          <button
            onClick={() => navigate('/reports')}
            className="bg-[#0a6659] hover:bg-[#004c42] text-white text-xs font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-xs flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">summarize</span>
            <span>View Reports</span>
          </button>
        </div>
      </section>

      {/* KPI Stats Row */}
      {statusData?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-xs">
            <span className="text-xs text-[#57605f] font-semibold uppercase">Total Rules</span>
            <p className="text-2xl font-heading font-bold text-[#0b1c30] mt-1">
              {statusData.summary.total_requirements}
            </p>
          </div>
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-xs">
            <span className="text-xs text-[#57605f] font-semibold uppercase">Mandatory Gaps</span>
            <p className={`text-2xl font-heading font-bold mt-1 ${statusData.summary.mandatory_gaps > 0 ? 'text-[#ba1a1a]' : 'text-[#16a34a]'}`}>
              {statusData.summary.mandatory_gaps}
            </p>
          </div>
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-xs">
            <span className="text-xs text-[#57605f] font-semibold uppercase">Satisfied</span>
            <p className="text-2xl font-heading font-bold text-[#16a34a] mt-1">
              {statusData.summary.counts_by_state?.satisfied || 0}
            </p>
          </div>
          <div className="bg-white border border-[#E2E8F0] p-4 rounded-xl shadow-xs">
            <span className="text-xs text-[#57605f] font-semibold uppercase">Expiring / Pending</span>
            <p className="text-2xl font-heading font-bold text-[#d97706] mt-1">
              {(statusData.summary.counts_by_state?.expiring_soon || 0) + (statusData.summary.counts_by_state?.pending || 0)}
            </p>
          </div>
        </div>
      )}

      {/* MID SECTION - Credential Status Table */}
      <section className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs flex flex-col overflow-hidden">
        {/* Header & Filter Chips */}
        <div className="p-6 border-b border-[#E2E8F0] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#f8f9ff]/50">
          <div>
            <h2 className="font-heading font-bold text-lg text-[#0b1c30]">Credential Status &amp; Authority Checks</h2>
            <p className="text-xs text-[#57605f] mt-0.5">
              Live evaluation against policy rules and primary source authorities
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-[#eff4ff] p-1 rounded-lg border border-[#d3e4fe]">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'all' ? 'bg-[#0a6659] text-white' : 'text-[#57605f] hover:text-[#0b1c30]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('satisfied')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'satisfied' ? 'bg-[#16a34a] text-white' : 'text-[#57605f] hover:text-[#0b1c30]'
              }`}
            >
              Satisfied
            </button>
            <button
              onClick={() => setFilter('expiring')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'expiring' ? 'bg-[#d97706] text-white' : 'text-[#57605f] hover:text-[#0b1c30]'
              }`}
            >
              Expiring
            </button>
            <button
              onClick={() => setFilter('non_compliant')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                filter === 'non_compliant' ? 'bg-[#ba1a1a] text-white' : 'text-[#57605f] hover:text-[#0b1c30]'
              }`}
            >
              Gaps / Non-Compliant
            </button>
          </div>
        </div>

        {/* Credentials Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2">
              <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
              <span>Evaluating live compliance status from backend...</span>
            </div>
          ) : filteredFindings.length === 0 ? (
            <div className="p-12 text-center text-[#57605f]">
              <span className="material-symbols-outlined text-4xl text-[#0a6659] mb-2">fact_check</span>
              <p className="font-semibold text-[#0b1c30]">No active credential requirement gaps found</p>
              <p className="text-xs text-[#6f7976] mt-1">Clinician has satisfied all active policy requirements.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[950px]">
              <thead className="bg-[#eff4ff]/60 text-xs font-semibold text-[#57605f] border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-3.5 px-6">Credential Type</th>
                  <th className="py-3.5 px-6">Identifier / Rule</th>
                  <th className="py-3.5 px-6">Compliance Status</th>
                  <th className="py-3.5 px-6">Authority Status</th>
                  <th className="py-3.5 px-6">Expires On</th>
                  <th className="py-3.5 px-6">Source</th>
                  <th className="py-3.5 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm text-[#0b1c30]">
                {filteredFindings.map((f, idx) => {
                  const status = f.status || f.state || 'unknown';
                  const isGap = status === 'missing' || status === 'expired' || status === 'rejected';
                  const credType = f.credential_type || f.title || 'Credential';
                  const reasonText =
                    typeof f.reason === 'object' && f.reason !== null
                      ? ((f.reason as any).detail || (f.reason as any).code || '')
                      : typeof f.reason === 'string'
                      ? f.reason
                      : '';
                  const citationText =
                    typeof f.citation_text === 'string'
                      ? f.citation_text
                      : typeof f.citation_text === 'object' && f.citation_text !== null
                      ? JSON.stringify(f.citation_text)
                      : '';
                  return (
                    <tr
                      key={f.credential_id || f.requirement_id || idx}
                      className={`hover:bg-[#f8f9ff] transition-colors ${
                        isGap ? 'bg-[#ffdad6]/15' : ''
                      }`}
                    >
                      <td className="py-4 px-6 font-semibold uppercase text-xs text-[#0a6659]">
                        {credType.replace(/_/g, ' ')}
                      </td>

                      <td className="py-4 px-6">
                        <span className="font-mono text-xs font-medium text-[#0b1c30]">
                          {f.identifier || f.title || (f.requirement_id ? f.requirement_id.substring(0, 8) : 'Policy Clause')}
                        </span>
                        {reasonText && (
                          <p className="text-[11px] text-[#57605f] mt-0.5 max-w-md">
                            {reasonText}
                          </p>
                        )}
                        {citationText && (
                          <p className="text-[10px] text-[#6f7976] italic mt-0.5 line-clamp-1" title={citationText}>
                            Citation: {citationText}
                          </p>
                        )}
                      </td>

                      <td className="py-4 px-6">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                            status === 'satisfied' || status === 'verified'
                              ? 'bg-[#dcfce7] text-[#166534]'
                              : status === 'expiring_soon'
                              ? 'bg-[#fef3c7] text-[#92400e]'
                              : 'bg-[#ffdad6] text-[#ba1a1a]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[14px]">
                            {status === 'satisfied' || status === 'verified'
                              ? 'check_circle'
                              : status === 'expiring_soon'
                              ? 'schedule'
                              : 'error'}
                          </span>
                          {status.replace(/_/g, ' ')}
                        </span>
                      </td>

                      <td className="py-4 px-6">
                        <span className="text-xs capitalize text-[#57605f]">
                          {f.authority_status || (f.credential_id ? 'Registry Verified' : 'Awaiting Submission')}
                        </span>
                      </td>

                      <td className="py-4 px-6 text-xs text-[#57605f]">
                        {f.expires_on || (f.credential_id ? 'Permanent / Active' : 'Missing Requirement')}
                      </td>

                      <td className="py-4 px-6 text-xs text-[#6f7976]">
                        {f.source || (f.is_mandatory ? 'Mandatory Policy' : 'Policy Engine')}
                      </td>

                      <td className="py-4 px-6 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setActiveModal({ type: 'reverify', item: f })}
                            className="px-2.5 py-1 text-xs font-medium text-[#0a6659] hover:bg-[#eff4ff] rounded border border-[#0a6659] transition-colors cursor-pointer"
                          >
                            Re-verify
                          </button>
                          <button
                            onClick={() => setActiveModal({ type: 'override', item: f })}
                            className="px-2.5 py-1 text-xs font-medium text-[#57605f] hover:bg-[#eff4ff] rounded border border-[#CBD5E1] transition-colors cursor-pointer"
                          >
                            Review
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

      {/* Modal: Re-verify */}
      {activeModal?.type === 'reverify' && activeModal.item && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-[#CBD5E1] space-y-4">
            <h3 className="font-heading font-bold text-lg text-[#0b1c30] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0a6659]">sync</span>
              Re-verify Credential
            </h3>
            <p className="text-sm text-[#57605f]">
              Initiate a live real-time query against the authority registry for{' '}
              <strong className="text-[#0b1c30]">
                {((activeModal.item.credential_type || activeModal.item.title || 'Credential') as string).replace(/_/g, ' ')}
              </strong>?
            </p>
            <div className="flex justify-end gap-3 pt-3">
              <button
                disabled={isProcessing}
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#57605f] hover:bg-[#f8f9ff] cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing}
                onClick={() => handleReverify(activeModal.item)}
                className="px-4 py-2 bg-[#0a6659] text-white rounded-lg text-xs font-semibold hover:bg-[#004c42] flex items-center gap-1.5 cursor-pointer"
              >
                {isProcessing ? 'Checking Registry...' : 'Confirm Re-verify'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Manual Override */}
      {activeModal?.type === 'override' && activeModal.item && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-[#CBD5E1] space-y-4">
            <h3 className="font-heading font-bold text-lg text-[#0b1c30] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#ba1a1a]">gavel</span>
              Compliance Officer Review
            </h3>
            <p className="text-sm text-[#57605f]">
              Sign off on credential{' '}
              <strong className="text-[#0b1c30]">
                {((activeModal.item.credential_type || activeModal.item.title || 'Credential') as string).replace(/_/g, ' ')}
              </strong>. This decision is immutably recorded in the compliance audit trail.
            </p>
            <textarea
              rows={3}
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="Enter justification note for audit log..."
              className="w-full text-xs p-3 border border-[#CBD5E1] rounded-lg bg-[#f8f9ff] text-[#0b1c30] focus:outline-none focus:border-[#0a6659]"
            />
            <div className="flex justify-end gap-3 pt-2">
              <button
                disabled={isProcessing}
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#57605f] hover:bg-[#f8f9ff] cursor-pointer"
              >
                Cancel
              </button>
              <button
                disabled={isProcessing}
                onClick={() => handleOverrideSubmit(activeModal.item)}
                className="px-4 py-2 bg-[#0a6659] text-white rounded-lg text-xs font-semibold hover:bg-[#004c42] cursor-pointer"
              >
                {isProcessing ? 'Recording Decision...' : 'Approve & Clear Gap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
