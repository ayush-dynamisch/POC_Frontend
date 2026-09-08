import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import type { Role } from '../../types';

interface TopBarProps {
  onMobileMenuToggle?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onMobileMenuToggle }) => {
  const location = useLocation();
  const { user, switchRole } = useAuth();

  const getBreadcrumbs = () => {
    const path = location.pathname;
    if (path === '/' || path === '/dashboard') {
      return [{ label: 'Dashboard', path: '/' }];
    }
    if (path.startsWith('/clinicians')) {
      return [
        { label: 'Dashboard', path: '/' },
        { label: 'Clinicians', path: '/clinicians' },
        { label: 'Sandra Okafor', path: '/clinicians' }
      ];
    }
    if (path.startsWith('/documents')) {
      return [
        { label: 'Dashboard', path: '/' },
        { label: 'Documents & Queue', path: '/documents' }
      ];
    }
    if (path.startsWith('/chat')) {
      return [
        { label: 'Dashboard', path: '/' },
        { label: 'AI Compliance Chat', path: '/chat' }
      ];
    }
    if (path.startsWith('/reports')) {
      return [
        { label: 'Dashboard', path: '/' },
        { label: 'Reports & Approval Gate', path: '/reports' }
      ];
    }
    if (path.startsWith('/onboardOrg')) {
      return [
        { label: 'Organizations', path: '/onboardOrg' },
        { label: 'Onboard New Organization (Super Admin)', path: '/onboardOrg' }
      ];
    }
    return [{ label: 'Dashboard', path: '/' }];
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="h-16 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 flex-shrink-0 z-20 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
      {/* Breadcrumbs / Title */}
      <div className="flex items-center gap-2 text-sm text-[#57605f]">
        <button
          onClick={onMobileMenuToggle}
          className="p-1.5 -ml-2 mr-1 text-[#57605f] hover:text-[#0a6659] hover:bg-[#eff4ff] rounded-lg md:hidden"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        <Link to="/" className="text-[#6f7976] hover:text-[#0a6659] transition-colors flex items-center">
          <span className="material-symbols-outlined text-[18px]">home</span>
        </Link>
        {breadcrumbs.map((bc, idx) => (
          <React.Fragment key={idx}>
            <span className="text-[#bec9c5]">/</span>
            {idx === breadcrumbs.length - 1 ? (
              <span className="text-[#004c42] font-semibold">{bc.label}</span>
            ) : (
              <Link to={bc.path} className="hover:text-[#0a6659] transition-colors">
                {bc.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* Right Controls: Search, Org, Notifications, Role Switcher */}
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative hidden lg:block w-64">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7976] text-[18px]">
            search
          </span>
          <input
            type="text"
            placeholder="Search clinicians, licenses..."
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-[#eff4ff] border border-[#d3e4fe] rounded-full text-[#0b1c30] placeholder-[#6f7976] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
          />
        </div>

        {/* Active Organization Badge */}
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 bg-[#eff4ff] border border-[#d3e4fe] rounded-lg text-xs font-medium text-[#004c42]">
          <span className="material-symbols-outlined text-[16px] text-[#0a6659]">apartment</span>
          <span className="truncate max-w-[140px]">{user?.organizationName || 'St. Mercy Health'}</span>
        </div>

        {/* Role Switcher for POC Evaluation */}
        <div className="flex items-center gap-1.5 bg-[#eff4ff] border border-[#d3e4fe] px-2 py-1 rounded-lg">
          <span className="text-[11px] font-semibold text-[#57605f] uppercase tracking-wider hidden md:inline">
            Role:
          </span>
          <select
            value={user?.role || 'compliance_officer'}
            onChange={(e) => switchRole(e.target.value as Role)}
            className="bg-transparent text-xs font-semibold text-[#004c42] outline-none cursor-pointer pr-1"
          >
            <option value="compliance_officer">Compliance Officer</option>
            <option value="admin">Org Admin</option>
            <option value="super_admin">Super Admin</option>
            <option value="hr">HR Specialist</option>
            <option value="clinician">Clinician</option>
          </select>
        </div>

        {/* Notification Bell with 3 pending count */}
        <Link
          to="/documents"
          title="3 pending document checks"
          className="relative p-2 text-[#004c42] hover:bg-[#eff4ff] rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[20px]">notifications</span>
          <span className="absolute top-1 right-1 w-4 h-4 bg-[#ba1a1a] text-white rounded-full text-[10px] flex items-center justify-center font-bold shadow-sm">
            3
          </span>
        </Link>
      </div>
    </header>
  );
};
