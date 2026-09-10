import React, { useEffect, useState } from 'react';
import { policiesApi, type ProposedRequirement } from '../../services/api';

interface PolicyReviewModalProps {
  policyDocumentId: string;
  onClose: () => void;
  onPublished: () => void;
}

const STATUS_BADGE: Record<ProposedRequirement['status'], string> = {
  pending: 'bg-[#fff8e1] text-[#9a6700] border-[#f5deb3]',
  active: 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]',
  rejected: 'bg-[#ffdad6] text-[#ba1a1a] border-[#ffb4ab]'
};

export const PolicyReviewModal: React.FC<PolicyReviewModalProps> = ({ policyDocumentId, onClose, onPublished }) => {
  const [title, setTitle] = useState('');
  const [policyStatus, setPolicyStatus] = useState<string>('');
  const [requirements, setRequirements] = useState<ProposedRequirement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const review = await policiesApi.getReview(policyDocumentId);
        if (cancelled) return;
        setTitle(review.title);
        setPolicyStatus(review.status);
        setRequirements(review.requirements || []);
      } catch (err: any) {
        if (!cancelled) setLoadError(err.message || 'Failed to load proposed requirements');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [policyDocumentId]);

  const toggleChecked = (id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handlePublish = async (acceptAll: boolean) => {
    setIsPublishing(true);
    setPublishError(null);
    try {
      await policiesApi.publish(policyDocumentId, acceptAll ? { acceptAll: true } : { accept: Array.from(checkedIds) });
      onPublished();
    } catch (err: any) {
      setPublishError(err.message || 'Failed to publish policy');
    } finally {
      setIsPublishing(false);
    }
  };

  const isDraft = policyStatus === 'draft';
  const countOf = (status: ProposedRequirement['status']) =>
    requirements.filter((r) => r.status === status).length;
  const pendingCount = countOf('pending');

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl max-w-3xl w-full max-h-[85vh] p-6 md:p-8 shadow-xl border border-[#CBD5E1] flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
          <div>
            <h3 className="font-heading font-bold text-lg text-[#0b1c30]">
              {isDraft ? 'Review Requirements' : 'Policy Requirements'}
            </h3>
            <p className="text-xs text-[#57605f] mt-0.5">{title || policyDocumentId}</p>
            {requirements.length > 0 && (
              <p className="text-[11px] text-[#6f7976] mt-1">
                {countOf('active')} active · {pendingCount} pending · {countOf('rejected')} rejected
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-[#6f7976] hover:text-[#0b1c30] cursor-pointer shrink-0">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {isLoading ? (
            <div className="p-8 text-center text-[#57605f] flex items-center justify-center gap-2 text-sm">
              <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
              <span>Loading proposed requirements...</span>
            </div>
          ) : loadError ? (
            <div className="p-4 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-sm">{loadError}</div>
          ) : requirements.length === 0 ? (
            <div className="p-8 text-center text-[#57605f] text-sm">No requirements were extracted from this document.</div>
          ) : (
            requirements.map((req) => (
              <div key={req.id} className="p-4 border border-[#E2E8F0] rounded-lg space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {req.status === 'pending' && (
                      <input
                        type="checkbox"
                        checked={checkedIds.has(req.id)}
                        onChange={() => toggleChecked(req.id)}
                        className="mt-1 cursor-pointer"
                      />
                    )}
                    <div>
                      <p className="text-sm font-semibold text-[#0b1c30] capitalize">
                        {req.credential_type.replace(/_/g, ' ')} — {req.role}
                      </p>
                      <p className="text-[11px] text-[#6f7976]">
                        {req.jurisdiction || 'All jurisdictions'} · {req.is_mandatory ? 'Mandatory' : 'Optional'}
                        {typeof req.renewal_months === 'number' ? ` · Renews every ${req.renewal_months}mo` : ''}
                      </p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border shrink-0 ${STATUS_BADGE[req.status]}`}>
                    {req.status}
                  </span>
                </div>
                <p className="text-xs text-[#0b1c30] bg-[#f8f9ff] border border-[#E2E8F0] rounded-lg p-2.5 leading-relaxed">
                  {req.citation_text}
                </p>
                <p className="text-[11px] text-[#6f7976]">
                  Confidence: {Math.round(req.extractor_confidence * 100)}%
                </p>
              </div>
            ))
          )}
        </div>

        {publishError && (
          <div className="mt-4 p-3 bg-[#ffdad6] border border-[#ba1a1a] text-[#ba1a1a] rounded-lg text-xs shrink-0">
            {publishError}
          </div>
        )}

        {isDraft && pendingCount > 0 && (
          <div className="mt-4 pt-4 border-t border-[#E2E8F0] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
            <p className="text-xs text-[#57605f]">{pendingCount} requirement(s) pending a decision.</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePublish(false)}
                disabled={isPublishing || checkedIds.size === 0}
                className="px-4 py-2 rounded-lg border border-[#0a6659] text-[#0a6659] hover:bg-[#0a6659] hover:text-white disabled:opacity-50 text-xs font-semibold transition-colors cursor-pointer"
              >
                Publish Selected ({checkedIds.size})
              </button>
              <button
                onClick={() => handlePublish(true)}
                disabled={isPublishing}
                className="px-4 py-2 rounded-lg bg-[#0a6659] hover:bg-[#004c42] disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isPublishing ? (
                  <span className="material-symbols-outlined text-[16px] animate-spin">sync</span>
                ) : (
                  <span className="material-symbols-outlined text-[16px]">check_circle</span>
                )}
                Accept All &amp; Publish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
