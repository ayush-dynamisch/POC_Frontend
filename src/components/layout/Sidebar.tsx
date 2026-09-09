import React from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: 'dashboard', roles: ['admin', 'compliance_officer', 'hr'] },
    { to: '/clinicians', label: 'Clinicians', icon: 'medical_information', roles: ['admin', 'compliance_officer', 'hr', 'clinician'] },
    { to: '/documents', label: 'Documents', icon: 'description', roles: ['admin', 'compliance_officer', 'hr', 'clinician'] },
    { to: '/chat', label: 'AI Chat', icon: 'forum', roles: ['admin', 'compliance_officer', 'hr', 'clinician', 'super_admin'] },
    { to: '/reports', label: 'Reports', icon: 'analytics', roles: ['admin', 'compliance_officer', 'hr', 'clinician'] },
    {
      to: '/onboardOrg',
      label: 'Onboard Org',
      icon: 'corporate_fare',
      roles: ['super_admin'],
      isSpecial: true
    },
    {
      to: '/costManagement',
      label: 'Cost Management',
      icon: 'payments',
      roles: ['super_admin'],
      isSpecial: true
    }
  ];

  const visibleNavItems = navItems.filter((item) => !!user?.role && item.roles.includes(user.role));

  return (
    <aside className="w-[260px] bg-[#0a6659] text-white flex-shrink-0 flex flex-col justify-between hidden md:flex h-full border-r border-[#005046] shadow-md select-none">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-[#005046]/60 gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center text-white backdrop-blur-sm border border-white/20">
            <span className="material-symbols-outlined text-[22px]">health_and_safety</span>
          </div>
          <div>
            <span className="font-heading font-bold text-lg tracking-tight text-white flex items-center">
              MediVerify <span className="text-[#a4f1e0] ml-1 text-xs px-1.5 py-0.5 rounded bg-white/10 font-medium">AI</span>
            </span>
            <p className="text-[11px] text-[#a4f1e0]/80 tracking-wide font-medium">Healthcare Compliance</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="p-3 flex flex-col gap-1.5 mt-3">
          {visibleNavItems.map((item) => {
            const isActive =
              item.to === '/'
                ? location.pathname === '/' || location.pathname === '/dashboard'
                : location.pathname.startsWith(item.to);

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-white/15 text-white shadow-sm border-l-4 border-[#a4f1e0]'
                    : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] ${isActive ? 'text-[#a4f1e0]' : 'text-white/70'}`}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.isSpecial && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#a4f1e0]/20 text-[#a4f1e0]">
                    Admin
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Footer Profile & Actions */}
      <div className="p-4 border-t border-[#005046]/60 bg-[#004c42]/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.name}
                className="w-10 h-10 rounded-full object-cover border-2 border-[#a4f1e0]/50 shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#a4f1e0] text-[#00201b] font-bold flex items-center justify-center shrink-0">
                {user?.name?.slice(0, 2).toUpperCase() || 'SA'}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white truncate">{user?.name || 'Sarah Chen'}</div>
              <div className="text-[11px] text-[#a4f1e0]/90 capitalize truncate">
                {user?.role ? user.role.replace(/_/g, ' ') : 'Compliance Officer'}
              </div>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate('/login');
            }}
            title="Sign out"
            className="p-1.5 text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors ml-1 shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
          </button>
        </div>

        {/* Gov Registry status badge */}
        <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-[11px] text-white/70">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Gov API: Active
          </span>
          <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/80 font-mono">SANDBOX</span>
        </div>
      </div>
    </aside>
  );
};
