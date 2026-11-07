/**
 * Whole percentages that always add up to 100 (largest-remainder method), so the donut legend
 * and the "Top platform" card agree (DASH-06, DASH-09). Values must be ≥ 0.
 */
export function wholePercentages(values: readonly number[]): number[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (total <= 0) return values.map(() => 0);
  const exact = values.map((v) => (v / total) * 100);
  const floors = exact.map(Math.floor);
  let missing = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, rest: e - Math.floor(e) }))
    .sort((a, b) => b.rest - a.rest || a.i - b.i);
  const result = [...floors];
  for (const { i } of order) {
    if (missing <= 0) break;
    result[i] = (result[i] ?? 0) + 1;
    missing--;
  }
  return result;
}
