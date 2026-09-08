import React from 'react';
import { useRouteError, useNavigate } from 'react-router-dom';

export const RouteErrorBoundary: React.FC = () => {
  const error: any = useRouteError();
  const navigate = useNavigate();

  const errorMessage =
    typeof error?.statusText === 'string'
      ? error.statusText
      : typeof error?.message === 'string'
      ? error.message
      : typeof error === 'string'
      ? error
      : typeof error?.detail === 'string'
      ? error.detail
      : typeof error?.detail === 'object' && error?.detail !== null
      ? (error.detail.detail || error.detail.message || JSON.stringify(error.detail))
      : typeof error === 'object' && error !== null
      ? JSON.stringify(error)
      : 'An unexpected error occurred while rendering this page.';

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#f8f9ff]">
      <div className="max-w-md w-full bg-white rounded-2xl p-8 border border-[#E2E8F0] shadow-lg text-center space-y-5">
        <div className="w-16 h-16 bg-[#ffdad6] text-[#ba1a1a] rounded-2xl flex items-center justify-center mx-auto shadow-inner">
          <span className="material-symbols-outlined text-3xl">error_outline</span>
        </div>

        <div>
          <h2 className="text-xl font-heading font-bold text-[#0b1c30]">Something went wrong</h2>
          <p className="text-xs text-[#57605f] mt-1.5 leading-relaxed">
            The application encountered an unexpected issue while loading this view.
          </p>
        </div>

        <div className="bg-[#f8f9ff] border border-[#CBD5E1] p-3.5 rounded-xl text-left font-mono text-[11px] text-[#ba1a1a] break-words max-h-32 overflow-y-auto">
          {errorMessage}
        </div>

        <div className="flex gap-3 justify-center pt-2">
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border border-[#CBD5E1] rounded-lg text-xs font-semibold text-[#57605f] hover:bg-[#f8f9ff] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">refresh</span>
            Reload Page
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 bg-[#0a6659] text-white rounded-lg text-xs font-semibold hover:bg-[#004c42] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
          >
            <span className="material-symbols-outlined text-[16px]">dashboard</span>
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
