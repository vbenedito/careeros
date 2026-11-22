/**
 * ADM-20: pure geometry of the stacked charts. A segment with a value above 0 is never smaller
 * than `min` (so a tiny share stays visible), and the segments still add up to the column or bar.
 */

/**
 * Lengths of the segments of one stack, in the same unit as `length` and `min`.
 * - A zero value gets 0.
 * - A segment whose share is under `min` gets `min`; the others share what is left in proportion.
 * - The stack is never shorter than `min` per segment: `length` grows to fit them if it must.
 */
export function segmentLengths(values: readonly number[], length: number, min: number): number[] {
  const positive = values.filter((v) => v > 0);
  const sum = positive.reduce((n, v) => n + v, 0);
  if (sum <= 0) return values.map(() => 0);
  const total = Math.max(length, positive.length * min);
  const raw = values.map((v) => (v > 0 ? (v / sum) * total : 0));
  const small = raw.map((r, i) => (values[i] ?? 0) > 0 && r < min);
  const fixed = small.filter(Boolean).length * min;
  const restRaw = raw.reduce((n, r, i) => (small[i] || r === 0 ? n : n + r), 0);
  const remaining = total - fixed;
  return raw.map((r, i) => {
    if (r === 0) return 0;
    if (small[i]) return min;
    return restRaw > 0 ? (r / restRaw) * remaining : 0;
  });
}
