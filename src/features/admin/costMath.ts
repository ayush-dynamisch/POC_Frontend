// Money formatting for the cost dashboard.
//
// The roll-ups themselves are SQL now — GET /agent-runs/summary groups by org,
// model and agent server-side. What is left on this side is presentation, plus
// the one thing that still needs care: the backend hands money over as
// `str(Decimal)` off a Numeric(12,6), and turning those into JS floats to
// compare or divide them drifts. So every figure becomes an integer micro-USD
// (1e-6 USD, which represents Numeric(12,6) exactly) before any arithmetic,
// and only becomes a string again at the point of display.

export function toMicros(cost: string | null | undefined): number {
  if (cost === null || cost === undefined) return 0;
  const parsed = parseFloat(cost);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed * 1_000_000);
}

export function formatUsd(micros: number): string {
  if (micros === 0) return '$0.00';
  // Sub-cent spend is the normal case for one cheap turn, so show enough
  // decimals to stay non-zero rather than rounding a real cost away to "$0.00".
  const usd = micros / 1_000_000;
  return usd < 1 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(2)}`;
}

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatMs(ms: number): string {
  if (ms <= 0) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Nearest-rank percentile, which needs no interpolation and always returns a
 * value that was actually observed. `p` is 0–100.
 */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length - 1, Math.max(0, rank - 1))];
}

/** Latency thresholds for the table, in the same shape as the document-score bars. */
export function latencyTone(ms: number): string {
  if (ms >= 10_000) return 'text-[#ba1a1a]';
  if (ms >= 5_000) return 'text-[#d97706]';
  return 'text-[#16a34a]';
}

/** One slice's share of the total, as a 0–100 bar width. */
export function share(micros: number, totalMicros: number): number {
  if (totalMicros <= 0) return 0;
  return Math.min(100, (micros / totalMicros) * 100);
}

/**
 * Period-over-period change. `null` when the previous period spent nothing —
 * a rise from zero has no percentage, and rendering it as +100% or +Infinity
 * would be a made-up number.
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}
