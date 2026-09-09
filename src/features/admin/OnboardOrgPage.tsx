import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminApi } from '../../services/api';
import type { OrganizationOnboardData } from '../../types';

export const OnboardOrgPage: React.FC = () => {
  const { user, switchRole } = useAuth();

  const [formData, setFormData] = useState<OrganizationOnboardData>({
    orgName: 'Bay Area Health System',
    orgEmail: 'compliance@bayareahealth.org',
    phone: '+1 (555) 234-5678',
    noOfEmployees: 250,
    adminName: 'Dr. Marcus Vance',
    adminEmail: 'admin@bayareahealth.org'
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{
    orgId: string;
    name: string;
    adminEmail: string;
    status: string;
    generatedPassword: string;
    createdAt: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);

  const isSuperAdmin = user?.role === 'super_admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const res = await adminApi.onboardOrg({
        name: formData.orgName,
        email: formData.orgEmail,
        phone: formData.phone,
        no_of_employees: Number(formData.noOfEmployees),
        admin_name: formData.adminName,
        admin_email: formData.adminEmail
      });

      setCreatedResult({
        orgId: res.org_id,
        name: res.name,
        adminEmail: res.admin_email,
        status: res.status,
        generatedPassword: res.password,
        createdAt: res.created_at
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to onboard organization with backend API');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyPassword = () => {
    if (createdResult) {
      navigator.clipboard.writeText(createdResult.generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8">
      {/* Header Section */}
      <div>
        <div className="flex items-center gap-2 text-xs text-[#57605f] mb-2 font-medium">
          <span className="text-[#0a6659]">Organizations</span>
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span>Super Admin Onboarding</span>
        </div>
        <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#0b1c30]">
          Onboard New Organization
        </h1>
        <p className="text-sm text-[#57605f] mt-1">
          Creates the organization tenant workspace and the primary administrator account in the backend database.
        </p>
      </div>

      {/* Role Notice if not Super Admin */}
      {!isSuperAdmin && (
        <div className="p-4 bg-[#eff4ff] border border-[#d3e4fe] rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-[#0b1c30]">
            <span className="material-symbols-outlined text-[#0a6659] text-[20px]">admin_panel_settings</span>
            <span>
              This route requires the <strong>Super Admin</strong> role (<code className="bg-white px-1.5 py-0.5 rounded border border-[#CBD5E1]">organizations:update</code>).
            </span>
          </div>
          <button
            onClick={() => switchRole('super_admin')}
            className="px-3 py-1.5 bg-[#0a6659] hover:bg-[#004c42] text-white text-xs font-semibold rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            Switch to Super Admin
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-xl flex items-center gap-3 text-sm">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Form Card - Super Admin only */}
      {isSuperAdmin && (
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 md:p-8 shadow-xs">
        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Section 1: Organization Details */}
          <section>
            <h2 className="font-heading font-bold text-lg text-[#0b1c30] mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0a6659]">domain</span>
              Organization Details
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Org Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                  Organization Name <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.orgName}
                  onChange={(e) => setFormData({ ...formData, orgName: e.target.value })}
                  placeholder="e.g. St. Mercy General Hospital"
                  className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>

              {/* Org Email */}
              <div>
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                  Organization Official Email <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.orgEmail}
                  onChange={(e) => setFormData({ ...formData, orgEmail: e.target.value })}
                  placeholder="compliance@stmercy.org"
                  className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>

              {/* Phone Number */}
              <div>
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="+1 (555) 000-0000"
                  className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>

              {/* Number of Employees */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                  Estimated Clinicians &amp; Workforce Count <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  required
                  value={formData.noOfEmployees}
                  onChange={(e) =>
                    setFormData({ ...formData, noOfEmployees: parseInt(e.target.value) || 0 })
                  }
                  className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>
            </div>
          </section>

          <hr className="border-[#E2E8F0]" />

          {/* Section 2: Primary Administrator */}
          <section>
            <h2 className="font-heading font-bold text-lg text-[#0b1c30] mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0a6659]">person_add</span>
              Primary Organization Administrator
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Admin Name */}
              <div>
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                  Admin Full Name <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.adminName}
                  onChange={(e) => setFormData({ ...formData, adminName: e.target.value })}
                  placeholder="e.g. Dr. Sarah Chen"
                  className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>

              {/* Admin Email */}
              <div>
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                  Admin Work Email <span className="text-[#ba1a1a]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.adminEmail}
                  onChange={(e) => setFormData({ ...formData, adminEmail: e.target.value })}
                  placeholder="admin@stmercy.org"
                  className="w-full h-11 px-4 rounded-lg border border-[#CBD5E1] bg-[#f8f9ff] text-sm text-[#0b1c30] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>
            </div>
          </section>

          {/* Submit Button */}
          <div className="pt-4 border-t border-[#E2E8F0] flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white rounded-lg font-semibold text-sm transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
                  <span>Dispatching to PostgreSQL Database...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[20px]">check_circle</span>
                  <span>Provision Organization &amp; Admin</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      )}

      {/* Success Modal */}
      {createdResult && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-2xl border border-[#CBD5E1] space-y-6 animate-in fade-in zoom-in duration-200">
            {/* Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#dcfce7] flex items-center justify-center text-[#166534]">
                <span className="material-symbols-outlined text-[28px]">domain_verification</span>
              </div>
              <div>
                <h3 className="font-heading font-bold text-lg text-[#0b1c30]">
                  Organization Provisioned!
                </h3>
                <p className="text-xs text-[#57605f]">
                  Tenant workspace successfully registered in live database.
                </p>
              </div>
            </div>

            {/* Credential Details */}
            <div className="bg-[#f8f9ff] border border-[#CBD5E1] rounded-xl p-4 space-y-3 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
                <span className="text-[#6f7976]">Organization ID</span>
                <span className="font-mono text-[#0b1c30] font-bold">{createdResult.orgId}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
                <span className="text-[#6f7976]">Organization Name</span>
                <span className="text-[#0b1c30] font-semibold">{createdResult.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
                <span className="text-[#6f7976]">Admin Email</span>
                <span className="text-[#0b1c30] font-semibold">{createdResult.adminEmail}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-[#E2E8F0]">
                <span className="text-[#6f7976]">Status</span>
                <span className="px-2 py-0.5 rounded-full bg-[#dcfce7] text-[#166534] font-bold uppercase text-[10px]">
                  {createdResult.status}
                </span>
              </div>

              {/* Temporary Password Box */}
              <div className="pt-2">
                <span className="text-[#6f7976] block mb-1 font-semibold">
                  Generated Admin Temporary Password:
                </span>
                <div className="flex items-center justify-between bg-white border border-[#CBD5E1] rounded-lg px-3 py-2">
                  <span className="font-mono font-bold text-sm text-[#0a6659]">
                    {createdResult.generatedPassword}
                  </span>
                  <button
                    onClick={copyPassword}
                    className="flex items-center gap-1 text-[#0a6659] hover:underline font-semibold cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">
                      {copied ? 'done' : 'content_copy'}
                    </span>
                    <span>{copied ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setCreatedResult(null)}
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
