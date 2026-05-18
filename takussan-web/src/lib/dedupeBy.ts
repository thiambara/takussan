/**
 * TCK-164 — keep multi-section listings (the home page rows) free of
 * duplicates: every property surfaces in *one* section only, in the order
 * sections are evaluated. Pure function, no allocation churn — accepts
 * already-known IDs so callers can chain across rows without rebuilding
 * the seen set each time.
 */
export function excludeSeen<T>(
  items: readonly T[],
  seen: ReadonlySet<number>,
  getId: (item: T) => number,
): T[] {
  if (items.length === 0) return [];
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(getId(item))) out.push(item);
  }
  return out;
}

/**
 * Convenience helper: feed a list of arrays in display order, get back the
 * same arrays with duplicates removed (each id surviving in the *first*
 * array it appears in).
 */
export function dedupeAcross<T>(
  rows: ReadonlyArray<readonly T[]>,
  getId: (item: T) => number,
): T[][] {
  const seen = new Set<number>();
  return rows.map((row) => {
    const filtered = excludeSeen(row, seen, getId);
    for (const item of filtered) seen.add(getId(item));
    return filtered;
  });
}
