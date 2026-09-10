import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, ROLE_ACCOUNTS } from '../../context/AuthContext';
import { sessionExpired } from '../../services/api';
import type { Role } from '../../types';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('org_1_compliance@example.com');
  const [password, setPassword] = useState('12345678');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  // Reuses the existing error banner to say why they landed back here.
  const [errorMessage, setErrorMessage] = useState<string | null>(
    sessionExpired.get() ? 'Your session has expired. Please sign in again.' : null
  );
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (role: Role) => {
    const creds = ROLE_ACCOUNTS[role];
    if (!creds) return;
    setEmail(creds.email);
    setPassword(creds.password);
    setLoading(true);
    setErrorMessage(null);
    try {
      await login(creds.email, creds.password);
      navigate('/');
    } catch (err: any) {
      setErrorMessage(err.message || `Login failed for ${role}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-[#f8f9ff]">
      {/* LEFT PANEL (55%) */}
      <div className="lg:w-[55%] bg-[#0a6659] text-white flex flex-col justify-between p-8 sm:p-12 lg:p-16 relative overflow-hidden">
        <div className="absolute -right-24 -top-24 w-96 h-96 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute -left-24 -bottom-24 w-96 h-96 bg-[#00201b]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Top Left */}
        <div className="flex items-center gap-3 z-10">
          <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-inner">
            <span className="material-symbols-outlined text-3xl text-white">health_and_safety</span>
          </div>
          <div>
            <span className="font-heading font-bold text-2xl tracking-tight text-white">MediVerify</span>
            <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-[#a4f1e0]/20 text-[#a4f1e0] border border-[#a4f1e0]/30">
              Backend Connected
            </span>
          </div>
        </div>

        {/* Center Hero Content */}
        <div className="my-12 lg:my-0 max-w-lg z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-[#a4f1e0] mb-6 backdrop-blur-sm border border-white/10">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Live FastAPI Backend (:8000)
          </div>
          <h1 className="font-heading font-bold text-3xl sm:text-4xl lg:text-5xl text-white leading-tight mb-6">
            Compliance Intelligence for Healthcare
          </h1>
          <p className="text-base sm:text-lg text-white/80 leading-relaxed max-w-md">
            Zero-delay license reverification, automated document tamper detection, and audit-ready reporting powered by
            autonomous clinical AI agents.
          </p>
        </div>

        {/* Bottom Trust Badges */}
        <div className="flex flex-wrap gap-3 sm:gap-4 z-10">
          <div className="px-4 py-2 border border-white/20 rounded-full flex items-center gap-2 bg-white/10 backdrop-blur-md text-xs font-medium text-white shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-[#a4f1e0]">verified_user</span>
            <span>HIPAA Compliant</span>
          </div>
          <div className="px-4 py-2 border border-white/20 rounded-full flex items-center gap-2 bg-white/10 backdrop-blur-md text-xs font-medium text-white shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-[#a4f1e0]">security</span>
            <span>SOC 2 Type II</span>
          </div>
          <div className="px-4 py-2 border border-white/20 rounded-full flex items-center gap-2 bg-white/10 backdrop-blur-md text-xs font-medium text-white shadow-sm">
            <span className="material-symbols-outlined text-[18px] text-[#a4f1e0]">lock</span>
            <span>256-bit AES Encryption</span>
          </div>
        </div>
      </div>

      {/* RIGHT PANEL (45%) */}
      <div className="lg:w-[45%] flex flex-col justify-center items-center p-8 sm:p-12 lg:p-16 bg-white">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-8">
            <h2 className="font-heading font-bold text-2xl sm:text-3xl text-[#0b1c30] mb-2">
              Sign in to your workspace
            </h2>
            <p className="text-sm text-[#57605f]">
              Enter your organizational credentials to continue
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3.5 bg-[#ffdad6] border border-[#fecaca] text-[#ba1a1a] rounded-lg text-xs font-semibold flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider mb-2">
                Work Email
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6f7976] text-[18px]">
                  mail
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@hospital.org"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-[#f8f9ff] border border-[#CBD5E1] rounded-lg text-sm text-[#0b1c30] placeholder-[#6f7976] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-xs font-semibold text-[#0b1c30] uppercase tracking-wider">
                  Password
                </label>
                <a href="#forgot" onClick={(e) => e.preventDefault()} className="text-xs font-medium text-[#0a6659] hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6f7976] text-[18px]">
                  lock
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="w-full pl-11 pr-11 py-3 bg-[#f8f9ff] border border-[#CBD5E1] rounded-lg text-sm text-[#0b1c30] placeholder-[#6f7976] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#6f7976] hover:text-[#0b1c30]"
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-[#57605f]">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-[#CBD5E1] text-[#0a6659] focus:ring-[#0a6659]"
                />
                <span>Remember this workstation for 30 days</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white font-medium text-sm rounded-lg transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-[18px] animate-spin">sync</span>
                  <span>Verifying credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
                </>
              )}
            </button>
          </form>

          {/* Quick Sign In with Seeded DB Accounts */}
          <div className="mt-8 pt-6 border-t border-[#E2E8F0]">
            <p className="text-xs font-semibold text-[#57605f] uppercase tracking-wider mb-3 text-center">
              One-Click Seeded DB Logins:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('compliance_officer')}
                disabled={loading}
                className="text-left p-2.5 rounded-lg border border-[#CBD5E1] hover:border-[#0a6659] hover:bg-[#eff4ff] transition-all text-xs cursor-pointer"
              >
                <div className="font-semibold text-[#0b1c30]">Compliance Officer</div>
                <div className="text-[11px] text-[#57605f] truncate">org_1_compliance@...</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('super_admin')}
                disabled={loading}
                className="text-left p-2.5 rounded-lg border border-[#CBD5E1] hover:border-[#0a6659] hover:bg-[#eff4ff] transition-all text-xs cursor-pointer"
              >
                <div className="font-semibold text-[#0b1c30]">Super Admin</div>
                <div className="text-[11px] text-[#57605f] truncate">ayush.amberkar@...</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('admin')}
                disabled={loading}
                className="text-left p-2.5 rounded-lg border border-[#CBD5E1] hover:border-[#0a6659] hover:bg-[#eff4ff] transition-all text-xs cursor-pointer"
              >
                <div className="font-semibold text-[#0b1c30]">Org Admin</div>
                <div className="text-[11px] text-[#57605f] truncate">org_1_admin@...</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickLogin('clinician')}
                disabled={loading}
                className="text-left p-2.5 rounded-lg border border-[#CBD5E1] hover:border-[#0a6659] hover:bg-[#eff4ff] transition-all text-xs cursor-pointer"
              >
                <div className="font-semibold text-[#0b1c30]">Clinician (Nurse)</div>
                <div className="text-[11px] text-[#57605f] truncate">org_1_nurse@...</div>
              </button>
            </div>
          </div>

          <div className="mt-6 text-center text-[11px] text-[#6f7976]">
            Secure session verified with SAML 2.0 &amp; OAuth 2.1 via FastAPI
          </div>
        </div>
      </div>
    </div>
  );
};
