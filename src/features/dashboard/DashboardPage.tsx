import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardApi, type DashboardResponse } from '../../services/api';

export const DashboardPage: React.FC = () => {
  const { user, isLoading: authLoading } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'compliant' | 'expiring' | 'non_compliant'>('all');
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const orgId = user?.orgId || '9eb9dedb-5433-4d45-9479-23eb965a8427';

  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      navigate('/login');
      return;
    }

    const fetchDashboard = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await dashboardApi.getDashboard(orgId);
        setDashboardData(data);
      } catch (err: any) {
        console.error('Failed to load dashboard:', err);
        setError(err.message || 'Failed to connect to backend dashboard.');
      } finally {
        setLoading(false);
      }
    };

    if (user.role === 'super_admin') {
      // Super admin has no org dashboard, show super admin view
      setLoading(false);
    } else {
      fetchDashboard();
    }
  }, [user, orgId, authLoading, navigate]);

  if (user?.role === 'super_admin') {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-[#eff4ff] text-[#0a6659] flex items-center justify-center mx-auto mb-2">
          <span className="material-symbols-outlined text-3xl">shield_person</span>
        </div>
        <h2 className="font-heading font-bold text-2xl text-[#0b1c30]">Super Admin Central Console</h2>
        <p className="text-sm text-[#57605f] max-w-md mx-auto">
          You are authenticated as a Platform Super Administrator. Super admins provision tenant organizations and manage system-wide audit controls.
        </p>
        <div className="pt-4">
          <button
            onClick={() => navigate('/onboardOrg')}
            className="px-6 py-3 bg-[#0a6659] hover:bg-[#004c42] text-white font-semibold text-sm rounded-lg shadow-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">corporate_fare</span>
            <span>Go to Onboard Organization</span>
          </button>
        </div>
      </div>
    );
  }

  const totals = dashboardData?.totals || { clinicians: 0, compliant: 0, non_compliant: 0 };
  const countsByState = dashboardData?.counts_by_state || {
    satisfied: 0,
    pending: 0,
    missing: 0,
    expiring_soon: 0,
    expired: 0,
    rejected: 0
  };

  const compliantPercent =
    totals.clinicians > 0 ? Math.round((totals.compliant / totals.clinicians) * 100) : 100;

  const cliniciansList = dashboardData?.clinicians || [];

  const filteredClinicians = cliniciansList.filter((c) => {
    const matchesSearch =
      c.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.role.toLowerCase().includes(searchTerm.toLowerCase());

    const isNonCompliant = !c.summary.compliant;
    const isExpiring = (c.summary.counts_by_state?.expiring_soon || 0) > 0;
    const isCompliant = c.summary.compliant;

    let matchesFilter = true;
    if (statusFilter === 'compliant') matchesFilter = isCompliant && !isExpiring;
    if (statusFilter === 'expiring') matchesFilter = isExpiring;
    if (statusFilter === 'non_compliant') matchesFilter = isNonCompliant;

    return matchesSearch && matchesFilter;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#0b1c30]">
              Compliance Dashboard
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eff4ff] text-[#0a6659] border border-[#d3e4fe]">
              Live Backend
            </span>
          </div>
          <p className="text-sm text-[#57605f] mt-1">
            Real-time compliance rollup computed via LangGraph D3 evaluator &amp; D2 memory
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/documents')}
            className="px-4 py-2 bg-[#0a6659] hover:bg-[#004c42] text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span>
            <span>Upload Document</span>
          </button>
          <button
            onClick={() => navigate('/chat')}
            className="px-4 py-2 bg-white border border-[#CBD5E1] hover:bg-[#eff4ff] text-[#004c42] rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">smart_toy</span>
            <span>Ask AI</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-[#ffdad6] border border-[#fecaca] text-[#ba1a1a] rounded-xl text-sm font-medium flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => window.location.reload()}
            className="px-3 py-1 bg-white rounded border border-[#fecaca] text-xs font-semibold text-[#ba1a1a]"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* KPI 1 - Total */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#0a6659]"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-medium text-[#57605f]">Total Clinicians</span>
            <span className="material-symbols-outlined text-[#0a6659] bg-[#eff4ff] p-2 rounded-lg text-[20px]">
              groups
            </span>
          </div>
          <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
            {loading ? '...' : totals.clinicians}
          </div>
          <p className="text-xs text-[#57605f] mt-2 flex items-center gap-1">
            <span className="text-emerald-700 font-semibold">Active In Organization</span> (D2 state)
          </p>
        </div>

        {/* KPI 2 - Compliant */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#16a34a]"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-medium text-[#57605f]">Compliant</span>
            <span className="bg-[#dcfce7] text-[#166534] text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 border border-[#bbf7d0]">
              <span className="material-symbols-outlined text-[14px]">check_circle</span> On Track
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
              {loading ? '...' : `${compliantPercent}%`}
            </div>
            <div className="text-xs text-[#6f7976]">
              {totals.compliant} of {totals.clinicians}
            </div>
          </div>
          <p className="text-xs text-[#57605f] mt-2">Satisfying mandatory institutional policies</p>
        </div>

        {/* KPI 3 - Expiring */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#d97706]"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-medium text-[#57605f]">Expiring in 30 days</span>
            <span className="bg-[#fef3c7] text-[#92400e] text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 border border-[#fde68a]">
              <span className="material-symbols-outlined text-[14px]">schedule</span> Action Needed
            </span>
          </div>
          <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
            {loading ? '...' : countsByState.expiring_soon || 0}
          </div>
          <p className="text-xs text-[#d97706] mt-2 font-medium">Within 30-day renewal threshold</p>
        </div>

        {/* KPI 4 - Non-Compliant */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-1 bg-[#ba1a1a]"></div>
          <div className="flex justify-between items-start mb-3">
            <span className="text-sm font-medium text-[#57605f]">Non-Compliant</span>
            <span className="bg-[#ffdad6] text-[#93000a] text-[11px] px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 border border-[#fecaca]">
              <span className="material-symbols-outlined text-[14px]">warning</span> Critical
            </span>
          </div>
          <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
            {loading ? '...' : totals.non_compliant}
          </div>
          <p className="text-xs text-[#ba1a1a] mt-2 font-medium">Unsatisfied mandatory requirements</p>
        </div>
      </div>

      {/* Clinician Roster Table Card */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
        {/* Table Header Controls */}
        <div className="p-5 md:p-6 border-b border-[#E2E8F0] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#f8f9ff]/50">
          <div>
            <h2 className="font-heading font-bold text-xl text-[#0b1c30]">Clinician Roster</h2>
            <p className="text-xs text-[#57605f] mt-0.5">Live database synchronization from D2 memory service</p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter pills */}
            <div className="flex items-center gap-1 bg-[#eff4ff] p-1 rounded-lg border border-[#d3e4fe]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-[#0a6659] text-white shadow-xs'
                    : 'text-[#57605f] hover:text-[#0b1c30]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setStatusFilter('compliant')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === 'compliant'
                    ? 'bg-[#16a34a] text-white shadow-xs'
                    : 'text-[#57605f] hover:text-[#0b1c30]'
                }`}
              >
                Compliant
              </button>
              <button
                onClick={() => setStatusFilter('expiring')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === 'expiring'
                    ? 'bg-[#d97706] text-white shadow-xs'
                    : 'text-[#57605f] hover:text-[#0b1c30]'
                }`}
              >
                Expiring
              </button>
              <button
                onClick={() => setStatusFilter('non_compliant')}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === 'non_compliant'
                    ? 'bg-[#ba1a1a] text-white shadow-xs'
                    : 'text-[#57605f] hover:text-[#0b1c30]'
                }`}
              >
                Non-Compliant
              </button>
            </div>

            {/* Search */}
            <div className="relative flex-1 md:w-64">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7976] text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by name, role..."
                className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0b1c30] placeholder-[#6f7976] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20"
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2">
              <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
              <span>Loading roster from backend...</span>
            </div>
          ) : filteredClinicians.length === 0 ? (
            <div className="p-12 text-center text-[#57605f]">
              <span className="material-symbols-outlined text-4xl text-[#CBD5E1] mb-2">person_search</span>
              <p className="font-semibold text-[#0b1c30]">No clinicians found matching criteria.</p>
              <p className="text-xs text-[#6f7976] mt-1">Upload credential documents to begin tracking.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#eff4ff]/60 border-b border-[#E2E8F0] text-xs font-semibold text-[#57605f]">
                  <th className="py-3.5 px-5">Name</th>
                  <th className="py-3.5 px-5">Clinical Role</th>
                  <th className="py-3.5 px-5">Mandatory Gaps</th>
                  <th className="py-3.5 px-5">Compliance Status</th>
                  <th className="py-3.5 px-5">Satisfied / Total</th>
                  <th className="py-3.5 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-sm text-[#0b1c30]">
                {filteredClinicians.map((clinician) => {
                  const isNonCompliant = !clinician.summary.compliant;
                  const isExpiring = (clinician.summary.counts_by_state?.expiring_soon || 0) > 0;
                  const initials = clinician.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .substring(0, 2)
                    .toUpperCase();

                  return (
                    <tr
                      key={clinician.clinician_id}
                      className={`hover:bg-[#f8f9ff] transition-colors ${
                        isNonCompliant ? 'bg-[#ffdad6]/10' : ''
                      }`}
                    >
                      <td className="py-4 px-5 font-medium">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${
                              isNonCompliant
                                ? 'bg-[#ffdad6] text-[#93000a]'
                                : isExpiring
                                ? 'bg-[#fef3c7] text-[#92400e]'
                                : 'bg-[#d8e2e0] text-[#004c42]'
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-[#0b1c30]">{clinician.full_name}</div>
                            <div className="text-xs text-[#6f7976] font-mono">ID: {clinician.clinician_id.substring(0, 8)}...</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-5 text-[#57605f] capitalize">{clinician.role}</td>

                      <td className="py-4 px-5 text-[#57605f]">
                        {clinician.summary.mandatory_gaps > 0 ? (
                          <span className="font-semibold text-[#ba1a1a]">
                            {clinician.summary.mandatory_gaps} missing requirement(s)
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">All mandatory met</span>
                        )}
                      </td>

                      <td className="py-4 px-5">
                        {isNonCompliant ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#ffdad6] text-[#93000a] text-xs font-semibold border border-[#fecaca]">
                            <span className="material-symbols-outlined text-[14px]">error</span>
                            Non-Compliant
                          </span>
                        ) : isExpiring ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#fef3c7] text-[#92400e] text-xs font-semibold border border-[#fde68a]">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            Expiring Soon
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#dcfce7] text-[#166534] text-xs font-semibold border border-[#bbf7d0]">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            Compliant
                          </span>
                        )}
                      </td>

                      <td className="py-4 px-5 text-xs text-[#57605f]">
                        {clinician.summary.counts_by_state?.satisfied || 0} of {clinician.summary.total_requirements || 0} reqs
                      </td>

                      <td className="py-4 px-5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => navigate(`/clinicians?id=${clinician.clinician_id}`)}
                            className="px-3 py-1.5 rounded-lg border border-[#0a6659] text-[#0a6659] hover:bg-[#0a6659] hover:text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            View Status
                          </button>
                          <button
                            onClick={() => navigate('/documents')}
                            className="px-3 py-1.5 rounded-lg border border-[#CBD5E1] text-[#57605f] hover:bg-[#eff4ff] hover:text-[#0b1c30] text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Upload
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
      </div>
    </div>
  );
};
