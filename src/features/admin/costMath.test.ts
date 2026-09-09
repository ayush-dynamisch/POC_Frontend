// Run: npm test  (tsc + node --test, no framework, no new dependency)
import assert from 'node:assert/strict';
import test from 'node:test';

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
} from './costMath.ts';

test('Decimal strings convert to exact micro-USD', () => {
  assert.equal(toMicros('0.000001'), 1);
  assert.equal(toMicros('12.345678'), 12_345_678);
  assert.equal(toMicros('0'), 0);
});

test('missing or malformed cost reads as zero, never NaN', () => {
  // The summary endpoint coalesces to 0, so a null here is a defensive path —
  // but NaN leaking into a bar width silently blanks the whole panel.
  assert.equal(toMicros(null), 0);
  assert.equal(toMicros(undefined), 0);
  assert.equal(toMicros(''), 0);
  assert.equal(toMicros('not-a-number'), 0);
});

test('micro-USD arithmetic does not drift where floats would', () => {
  const rows = Array.from({ length: 300 }, () => '0.000001');
  const exact = rows.reduce((sum, c) => sum + toMicros(c), 0);
  assert.equal(exact, 300);
  // The version we avoided: 300 float additions of 1e-6 miss 0.0003.
  assert.notEqual(
    rows.reduce((sum, c) => sum + parseFloat(c), 0),
    0.0003,
  );
});

test('sub-cent spend is not rounded away to $0.00', () => {
  assert.equal(formatUsd(0), '$0.00');
  assert.equal(formatUsd(1200), '$0.0012');
  assert.equal(formatUsd(2_500_000), '$2.50');
  assert.equal(formatUsd(1_234_567_000), '$1234.57');
});

test('share is a clamped percentage and survives a zero total', () => {
  assert.equal(share(2500, 10000), 25);
  assert.equal(share(0, 0), 0); // an empty window must not blank the bars
  assert.equal(share(500, 0), 0);
  assert.equal(share(20000, 10000), 100); // clamped, never overflows its track
});

test('delta against a zero baseline is null, not Infinity', () => {
  assert.equal(deltaPct(100, 0), null);
  assert.equal(deltaPct(150, 100), 50);
  assert.equal(deltaPct(50, 100), -50);
});

test('percentile is nearest-rank and never reads past the array', () => {
  const ten = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.equal(percentile(ten, 50), 5);
  assert.equal(percentile(ten, 95), 10);
  assert.equal(percentile(ten, 100), 10); // must not index at length
  assert.equal(percentile(ten, 0), 1); // must not index at -1
  assert.equal(percentile([42], 95), 42);
  assert.equal(percentile([], 95), 0); // empty window, not NaN
});

test('percentile does not mutate its input and sorts numerically', () => {
  const input = [100, 25, 9];
  assert.equal(percentile(input, 50), 25);
  // A default .sort() would order these as 100, 25, 9 by string.
  assert.deepEqual(input, [100, 25, 9]);
});

test('avg survives an empty window', () => {
  assert.equal(avg([2, 4, 6]), 4);
  assert.equal(avg([]), 0);
});

test('latency formats by magnitude and flags nothing to show', () => {
  assert.equal(formatMs(412), '412ms');
  assert.equal(formatMs(3240), '3.24s');
  assert.equal(formatMs(0), '—');
});

test('latency tone escalates at the 5s and 10s thresholds', () => {
  assert.equal(latencyTone(1200), 'text-[#16a34a]');
  assert.equal(latencyTone(5000), 'text-[#d97706]');
  assert.equal(latencyTone(12_000), 'text-[#ba1a1a]');
});

test('token counts compact without losing magnitude', () => {
  assert.equal(formatCompact(842), '842');
  assert.equal(formatCompact(12_400), '12.4K');
  assert.equal(formatCompact(3_200_000), '3.2M');
});
