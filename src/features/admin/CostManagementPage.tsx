import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  costApi,
  type AgentRunRow,
  type AgentRunsSummary,
} from '../../services/api';
import {
  avg,
  deltaPct,
  formatCompact,
  formatMs,
  formatUsd,
  latencyTone,
  percentile,
  share,
  toMicros,
} from './costMath';

// Windows the summary endpoint understands. `null` means omit `since` entirely,
// which the backend reads as "everything so far".
const WINDOWS = [
  { key: '7d', label: '7 days', days: 7 },
  { key: '30d', label: '30 days', days: 30 },
  { key: '90d', label: '90 days', days: 90 },
  { key: 'all', label: 'All time', days: null },
] as const;

type WindowKey = (typeof WINDOWS)[number]['key'];

const DOMAINS = ['d1_rag', 'd2_memory', 'd3_agents', 'd4_connectors'];

function sinceIso(days: number | null): string | undefined {
  if (days === null) return undefined;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export const CostManagementPage: React.FC = () => {
  const { user, switchRole, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [windowKey, setWindowKey] = useState<WindowKey>('30d');
  const [summary, setSummary] = useState<AgentRunsSummary | null>(null);
  // The previous window of equal length, for the spend delta. Its only job is
  // one percentage on one tile, so a failure here must not fail the page.
  const [priorMicros, setPriorMicros] = useState<number | null>(null);
  const [runs, setRuns] = useState<AgentRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [domainFilter, setDomainFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const isSuperAdmin = user?.role === 'super_admin';
  const activeWindow = WINDOWS.find((w) => w.key === windowKey)!;

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    // `audit_logs:read` is a super-admin scope; anyone else would get a 403,
    // so don't spend the request. Nothing below the role notice renders for
    // them either, so the loading flag is never read on this path.
    if (!isSuperAdmin) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      const since = sinceIso(activeWindow.days);
      try {
        const [nextSummary, feed] = await Promise.all([
          costApi.getSummary({ since }),
          costApi.listAgentRuns({ since }),
        ]);
        if (cancelled) return;
        setSummary(nextSummary);
        setRuns(feed.runs);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Failed to load cost summary:', err);
        setError(err.message || 'Failed to load agent spend from the backend.');
        setSummary(null);
        setRuns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Comparison window, best effort and never fatal.
      if (activeWindow.days === null) {
        setPriorMicros(null);
        return;
      }
      try {
        const span = activeWindow.days * 86_400_000;
        const prior = await costApi.getSummary({
          since: new Date(Date.now() - span * 2).toISOString(),
          until: new Date(Date.now() - span).toISOString(),
        });
        if (!cancelled) setPriorMicros(toMicros(prior.total.cost_usd));
      } catch {
        if (!cancelled) setPriorMicros(null);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, isSuperAdmin, activeWindow, navigate, reloadKey]);

  const totalMicros = toMicros(summary?.total.cost_usd);
  const totalRuns = summary?.total.runs ?? 0;
  const totalTokens = summary?.total.tokens ?? 0;
  const byOrg = summary?.by_org ?? [];
  const byModel = summary?.by_model ?? [];
  const byAgent = summary?.by_agent ?? [];
  const unpriced = summary?.unpriced_models ?? [];

  const avgPerRunMicros = totalRuns > 0 ? Math.round(totalMicros / totalRuns) : 0;
  const modelCalls = byModel.reduce((sum, m) => sum + m.calls, 0);
  const spendDelta = deltaPct(totalMicros, priorMicros ?? 0);

  // Turn wall clock, from the row column. Deliberately NOT summed out of
  // `by_agent.latency_ms`: those are per-agent spans that nest inside one
  // another, so adding them across agents double-counts the same seconds. That
  // means this covers only the fetched page of runs, which the tile says.
  const runLatencies = runs
    .map((r) => r.latency_ms)
    .filter((ms): ms is number => ms !== null && ms > 0);
  const avgLatency = avg(runLatencies);
  const p95Latency = percentile(runLatencies, 95);

  const filteredRuns = runs.filter((run) => {
    const needle = searchTerm.toLowerCase();
    const matchesSearch =
      !needle ||
      run.agent_name.toLowerCase().includes(needle) ||
      (run.organization_name || '').toLowerCase().includes(needle);
    const matchesDomain = domainFilter === 'all' || run.domain === domainFilter;
    return matchesSearch && matchesDomain;
  });

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-heading font-bold text-2xl md:text-3xl text-[#0b1c30]">
              Cost Management
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#eff4ff] text-[#0a6659] border border-[#d3e4fe]">
              Platform Wide
            </span>
          </div>
          <p className="text-sm text-[#57605f] mt-1">
            LLM spend across every tenant, rolled up from <code className="text-xs bg-[#eff4ff] px-1 py-0.5 rounded border border-[#d3e4fe]">agent_runs</code> by model, agent and organization
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#eff4ff] p-1 rounded-lg border border-[#d3e4fe]">
            {WINDOWS.map((w) => (
              <button
                key={w.key}
                onClick={() => setWindowKey(w.key)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  windowKey === w.key
                    ? 'bg-[#0a6659] text-white shadow-xs'
                    : 'text-[#57605f] hover:text-[#0b1c30]'
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            disabled={loading}
            className="px-4 py-2 bg-white border border-[#CBD5E1] hover:bg-[#eff4ff] disabled:opacity-50 text-[#004c42] rounded-lg text-sm font-medium transition-colors flex items-center gap-2 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>
              sync
            </span>
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Role notice */}
      {!isSuperAdmin && (
        <div className="p-4 bg-[#eff4ff] border border-[#d3e4fe] rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-[#0b1c30]">
            <span className="material-symbols-outlined text-[#0a6659] text-[20px]">admin_panel_settings</span>
            <span>
              Platform-wide spend requires the <strong>Super Admin</strong> role (<code className="bg-white px-1.5 py-0.5 rounded border border-[#CBD5E1]">audit_logs:read</code>). Other roles see only their own organization.
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

      {error && (
        <div className="p-4 bg-[#ffdad6] border border-[#fecaca] text-[#ba1a1a] rounded-xl text-sm font-medium flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px]">error</span>
          <span className="flex-1">{error}</span>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="px-3 py-1 bg-white rounded border border-[#fecaca] text-xs font-semibold text-[#ba1a1a] cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {isSuperAdmin && (
        <>
          {/* What the totals exclude — so they aren't mistaken for an invoice */}
          <div className="p-3.5 bg-white border border-[#E2E8F0] rounded-xl flex items-start gap-2.5 text-xs text-[#57605f]">
            <span className="material-symbols-outlined text-[#6f7976] text-[18px] shrink-0">info</span>
            <div className="space-y-1">
              <p>
                Metered from succeeded agent runs only. Failed turns write no run row, and rows created before the usage breakdown shipped carry totals but no model attribution — so this reads at or below true spend, never above.
              </p>
              {unpriced.length > 0 && (
                <p className="text-[#92400e]">
                  <strong>Undercounted:</strong> {unpriced.join(', ')} {unpriced.length === 1 ? 'has' : 'have'} no published price, so {unpriced.length === 1 ? 'its' : 'their'} tokens are counted but {unpriced.length === 1 ? 'its' : 'their'} cost is not.
                </p>
              )}
            </div>
          </div>

          {/* KPI tiles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#0a6659]"></div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-[#57605f]">Total Spend</span>
                <span className="material-symbols-outlined text-[#0a6659] bg-[#eff4ff] p-2 rounded-lg text-[20px]">payments</span>
              </div>
              <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
                {loading ? '...' : formatUsd(totalMicros)}
              </div>
              <p className="text-xs text-[#57605f] mt-2 flex items-center gap-1">
                {spendDelta === null ? (
                  <span className="text-[#6f7976]">
                    {activeWindow.days === null ? 'All recorded runs' : 'No prior-period baseline'}
                  </span>
                ) : (
                  <>
                    <span className={`font-semibold ${spendDelta > 0 ? 'text-[#ba1a1a]' : 'text-emerald-700'}`}>
                      {spendDelta > 0 ? '+' : ''}
                      {spendDelta.toFixed(1)}%
                    </span>
                    <span>vs previous {activeWindow.label}</span>
                  </>
                )}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#16a34a]"></div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-[#57605f]">Total Tokens</span>
                <span className="material-symbols-outlined text-[#16a34a] bg-[#dcfce7] p-2 rounded-lg text-[20px]">toll</span>
              </div>
              <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
                {loading ? '...' : formatCompact(totalTokens)}
              </div>
              <p className="text-xs text-[#57605f] mt-2">
                {formatCompact(byModel.reduce((s, m) => s + m.input, 0))} in ·{' '}
                {formatCompact(byModel.reduce((s, m) => s + m.output, 0))} out
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#d97706]"></div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-[#57605f]">Model Calls</span>
                <span className="material-symbols-outlined text-[#d97706] bg-[#fef3c7] p-2 rounded-lg text-[20px]">bolt</span>
              </div>
              <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
                {loading ? '...' : formatCompact(modelCalls)}
              </div>
              <p className="text-xs text-[#57605f] mt-2">
                across {totalRuns.toLocaleString()} agent {totalRuns === 1 ? 'run' : 'runs'}
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#0a6659]"></div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-[#57605f]">Avg Cost / Run</span>
                <span className="material-symbols-outlined text-[#0a6659] bg-[#eff4ff] p-2 rounded-lg text-[20px]">receipt_long</span>
              </div>
              <div className="font-heading font-bold text-3xl md:text-4xl text-[#0b1c30]">
                {loading ? '...' : formatUsd(avgPerRunMicros)}
              </div>
              <p className="text-xs text-[#57605f] mt-2">
                {byOrg.length} {byOrg.length === 1 ? 'organization' : 'organizations'} billing
              </p>
            </div>

            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 relative overflow-hidden shadow-xs hover:shadow-md transition-shadow">
              <div className="absolute top-0 left-0 w-full h-1 bg-[#6b321f]"></div>
              <div className="flex justify-between items-start mb-3">
                <span className="text-sm font-medium text-[#57605f]">Avg Latency</span>
                <span className="material-symbols-outlined text-[#6b321f] bg-[#ffdbd0] p-2 rounded-lg text-[20px]">timer</span>
              </div>
              <div className={`font-heading font-bold text-3xl md:text-4xl ${loading || runLatencies.length === 0 ? 'text-[#0b1c30]' : latencyTone(avgLatency)}`}>
                {loading ? '...' : formatMs(avgLatency)}
              </div>
              <p className="text-xs text-[#57605f] mt-2">
                {runLatencies.length === 0
                  ? 'No timed runs'
                  : `p95 ${formatMs(p95Latency)} · last ${runLatencies.length} runs`}
              </p>
            </div>
          </div>

          {/* Spend by organization */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <div className="p-5 md:p-6 border-b border-[#E2E8F0] bg-[#f8f9ff]/50">
              <h2 className="font-heading font-bold text-xl text-[#0b1c30]">Spend by Organization</h2>
              <p className="text-xs text-[#57605f] mt-0.5">
                Which tenants the platform's model budget goes to, over the selected window
              </p>
            </div>
            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
                  <span>Aggregating spend across tenants...</span>
                </div>
              ) : byOrg.length === 0 ? (
                <div className="p-12 text-center text-[#57605f]">
                  <span className="material-symbols-outlined text-4xl text-[#CBD5E1] mb-2">savings</span>
                  <p className="font-semibold text-[#0b1c30]">No agent spend recorded in this window.</p>
                  <p className="text-xs text-[#6f7976] mt-1">
                    Model-backed turns write a run row. A deployment on the deterministic agent tier makes no model calls, so it costs nothing to report.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#eff4ff]/60 border-b border-[#E2E8F0] text-xs font-semibold text-[#57605f]">
                      <th className="py-3.5 px-5">Organization</th>
                      <th className="py-3.5 px-5">Share of Spend</th>
                      <th className="py-3.5 px-5 text-right">Runs</th>
                      <th className="py-3.5 px-5 text-right">Tokens</th>
                      <th className="py-3.5 px-5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-sm text-[#0b1c30]">
                    {byOrg.map((org) => {
                      const micros = toMicros(org.cost_usd);
                      const pct = share(micros, totalMicros);
                      return (
                        <tr key={org.organization_id} className="hover:bg-[#f8f9ff] transition-colors">
                          <td className="py-4 px-5">
                            <div className="font-semibold text-[#0b1c30]">
                              {org.organization_name || 'Deleted organization'}
                            </div>
                            <div className="text-[11px] text-[#6f7976] font-mono">
                              {org.organization_id.substring(0, 8)}...
                            </div>
                          </td>
                          <td className="py-4 px-5 w-[28%]">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-[#d8e2e0] rounded-full overflow-hidden">
                                <div className="h-full bg-[#0a6659]" style={{ width: `${pct}%` }}></div>
                              </div>
                              <span className="text-xs font-semibold text-[#57605f] w-10 text-right">
                                {pct.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-4 px-5 text-right text-[#57605f]">{org.runs.toLocaleString()}</td>
                          <td className="py-4 px-5 text-right text-[#57605f]">{formatCompact(org.tokens)}</td>
                          <td className="py-4 px-5 text-right font-semibold font-mono text-[#0b1c30]">
                            {formatUsd(micros)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Model and agent breakdowns */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <BreakdownCard
              title="Spend by Model"
              subtitle="Where the money goes, per provider model"
              icon="smart_toy"
              emptyIcon="query_stats"
              emptyText="No model attribution in this window."
              emptyHint="Runs created before the usage breakdown shipped record a total but no per-model split."
              loading={loading}
              totalMicros={totalMicros}
              barColor="bg-[#0a6659]"
              rows={byModel.map((m) => ({
                key: m.model,
                micros: toMicros(m.cost_usd),
                meta: `${formatCompact(m.input + m.output)} tokens · ${m.calls.toLocaleString()} calls`,
                flagged: unpriced.includes(m.model),
              }))}
            />
            <BreakdownCard
              title="Spend & Latency by Agent"
              subtitle="Top 8 by cost, with each agent's own time per turn"
              icon="account_tree"
              emptyIcon="account_tree"
              emptyText="No agent attribution in this window."
              emptyHint="The per-agent split comes from the usage breakdown on each run."
              loading={loading}
              totalMicros={totalMicros}
              barColor="bg-[#d97706]"
              rows={byAgent.slice(0, 8).map((a) => {
                // Own-span time, so it is an average per turn for this agent —
                // not a share of the turn's wall clock.
                const perTurn = a.runs > 0 ? a.latency_ms / a.runs : 0;
                return {
                  key: a.agent,
                  micros: toMicros(a.cost_usd),
                  meta: `${formatCompact(a.tokens)} tokens · ${a.runs.toLocaleString()} ${a.runs === 1 ? 'turn' : 'turns'}`,
                  latencyMs: perTurn,
                  flagged: false,
                };
              })}
            />
          </div>

          {/* Recent runs */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
            <div className="p-5 md:p-6 border-b border-[#E2E8F0] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#f8f9ff]/50">
              <div>
                <h2 className="font-heading font-bold text-xl text-[#0b1c30]">Recent Agent Runs</h2>
                <p className="text-xs text-[#57605f] mt-0.5">
                  Most recent 50 runs in this window — latency flagged amber over 5s, red over 10s
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                <div className="flex items-center gap-1 bg-[#eff4ff] p-1 rounded-lg border border-[#d3e4fe]">
                  <button
                    onClick={() => setDomainFilter('all')}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                      domainFilter === 'all' ? 'bg-[#0a6659] text-white shadow-xs' : 'text-[#57605f] hover:text-[#0b1c30]'
                    }`}
                  >
                    All
                  </button>
                  {DOMAINS.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDomainFilter(d)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        domainFilter === d ? 'bg-[#0a6659] text-white shadow-xs' : 'text-[#57605f] hover:text-[#0b1c30]'
                      }`}
                    >
                      {d.toUpperCase().replace('_', ' ')}
                    </button>
                  ))}
                </div>
                <div className="relative flex-1 md:w-64">
                  <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#6f7976] text-[18px]">
                    search
                  </span>
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search by agent, organization..."
                    className="w-full pl-9 pr-4 py-1.5 text-xs bg-white border border-[#CBD5E1] rounded-lg text-[#0b1c30] placeholder-[#6f7976] focus:outline-none focus:border-[#0a6659] focus:ring-2 focus:ring-[#0a6659]/20"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              {loading ? (
                <div className="p-12 text-center text-[#57605f] flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
                  <span>Loading run feed from backend...</span>
                </div>
              ) : filteredRuns.length === 0 ? (
                <div className="p-12 text-center text-[#57605f]">
                  <span className="material-symbols-outlined text-4xl text-[#CBD5E1] mb-2">receipt_long</span>
                  <p className="font-semibold text-[#0b1c30]">No agent runs match these filters.</p>
                  <p className="text-xs text-[#6f7976] mt-1">Widen the window or clear the domain filter.</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#eff4ff]/60 border-b border-[#E2E8F0] text-xs font-semibold text-[#57605f]">
                      <th className="py-3.5 px-5">When</th>
                      <th className="py-3.5 px-5">Organization</th>
                      <th className="py-3.5 px-5">Agent</th>
                      <th className="py-3.5 px-5">Domain</th>
                      <th className="py-3.5 px-5 text-right">Tokens</th>
                      <th className="py-3.5 px-5 text-right">Latency</th>
                      <th className="py-3.5 px-5 text-right">Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E2E8F0] text-sm text-[#0b1c30]">
                    {filteredRuns.map((run) => (
                      <tr key={run.id} className="hover:bg-[#f8f9ff] transition-colors">
                        <td className="py-4 px-5 text-[#57605f] whitespace-nowrap">
                          {new Date(run.created_at).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-4 px-5">
                          <span className="text-xs font-medium text-[#0b1c30]">
                            {run.organization_name || (
                              <span className="text-[#6f7976] italic">unnamed</span>
                            )}
                          </span>
                        </td>
                        <td className="py-4 px-5 font-mono text-xs text-[#004c42]">{run.agent_name}</td>
                        <td className="py-4 px-5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#eff4ff] text-[#0a6659] text-[11px] font-semibold border border-[#d3e4fe]">
                            {run.domain}
                          </span>
                        </td>
                        <td className="py-4 px-5 text-right text-[#57605f]">
                          {run.tokens === null ? '—' : formatCompact(run.tokens)}
                        </td>
                        <td className="py-4 px-5 text-right">
                          {run.latency_ms === null ? (
                            <span className="text-[#6f7976]">—</span>
                          ) : (
                            <span className={`font-semibold font-mono ${latencyTone(run.latency_ms)}`}>
                              {formatMs(run.latency_ms)}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-5 text-right font-mono font-semibold">
                          {run.cost_usd === null ? (
                            <span
                              className="text-[#92400e] cursor-help"
                              title="Unpriced model — tokens were billed but this model has no published price, so no cost is attributed."
                            >
                              unpriced
                            </span>
                          ) : (
                            formatUsd(toMicros(run.cost_usd))
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

interface BreakdownRow {
  key: string;
  micros: number;
  meta: string;
  flagged: boolean;
  /** Avg time per turn, where the breakdown carries one. Omitted for models. */
  latencyMs?: number;
}

const BreakdownCard: React.FC<{
  title: string;
  subtitle: string;
  icon: string;
  emptyIcon: string;
  emptyText: string;
  emptyHint: string;
  loading: boolean;
  totalMicros: number;
  barColor: string;
  rows: BreakdownRow[];
}> = ({
  title,
  subtitle,
  icon,
  emptyIcon,
  emptyText,
  emptyHint,
  loading,
  totalMicros,
  barColor,
  rows,
}) => (
  <div className="bg-white rounded-xl border border-[#E2E8F0] overflow-hidden shadow-xs">
    <div className="p-5 border-b border-[#E2E8F0] bg-[#f8f9ff]/50 flex items-center gap-2.5">
      <span className="material-symbols-outlined text-[#0a6659] text-[20px]">{icon}</span>
      <div>
        <h2 className="font-heading font-bold text-lg text-[#0b1c30]">{title}</h2>
        <p className="text-xs text-[#57605f] mt-0.5">{subtitle}</p>
      </div>
    </div>
    {loading ? (
      <div className="p-10 text-center text-[#57605f] flex items-center justify-center gap-2">
        <span className="material-symbols-outlined animate-spin text-[#0a6659]">sync</span>
        <span className="text-sm">Loading...</span>
      </div>
    ) : rows.length === 0 ? (
      <div className="p-10 text-center text-[#57605f]">
        <span className="material-symbols-outlined text-4xl text-[#CBD5E1] mb-2">{emptyIcon}</span>
        <p className="font-semibold text-[#0b1c30] text-sm">{emptyText}</p>
        <p className="text-xs text-[#6f7976] mt-1 max-w-sm mx-auto">{emptyHint}</p>
      </div>
    ) : (
      <div className="p-5 space-y-4">
        {rows.map((row) => {
          const pct = share(row.micros, totalMicros);
          return (
            <div key={row.key}>
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-sm font-medium text-[#0b1c30] font-mono truncate">
                  {row.key}
                  {row.flagged && (
                    <span
                      className="ml-2 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#fef3c7] text-[#92400e] border border-[#fde68a]"
                      title="No published price — tokens counted, cost not."
                    >
                      Unpriced
                    </span>
                  )}
                </span>
                <span className="text-sm font-semibold font-mono text-[#0b1c30] shrink-0">
                  {formatUsd(row.micros)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-[#d8e2e0] rounded-full overflow-hidden">
                  <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                </div>
                <span className="text-[11px] text-[#6f7976] w-10 text-right">{pct.toFixed(0)}%</span>
              </div>
              <p className="text-[11px] text-[#6f7976] mt-1 flex items-center gap-1.5">
                <span>{row.meta}</span>
                {row.latencyMs !== undefined && row.latencyMs > 0 && (
                  <>
                    <span className="text-[#bec9c5]">·</span>
                    <span
                      className={`font-semibold ${latencyTone(row.latencyMs)}`}
                      title="Average of this agent's own span time per turn. Spans nest, so these do not sum to the turn's wall clock."
                    >
                      {formatMs(row.latencyMs)} avg
                    </span>
                  </>
                )}
              </p>
            </div>
          );
        })}
      </div>
    )}
  </div>
);
