/**
 * TCK-082 — localStorage persistence + helpers for the property comparator.
 *
 * Storage contract:
 *   Key:    `takussan.compare.v1`
 *   Value:  `{ ids: number[]; updated_at: number (ms epoch) }`
 *   TTL:    24h — anything older is treated as empty on read.
 *   Cap:    4 ids — writes that exceed are refused (caller should toast).
 */

export const COMPARE_STORAGE_KEY = 'takussan.compare.v1';
export const COMPARE_MAX_IDS = 4;
export const COMPARE_TTL_MS = 24 * 60 * 60 * 1000;

export type CompareState = {
  ids: number[];
  updated_at: number;
};

function emptyState(): CompareState {
  return { ids: [], updated_at: Date.now() };
}

export function readCompare(now: number = Date.now()): CompareState {
  if (typeof window === 'undefined') return emptyState();
  try {
    const raw = window.localStorage.getItem(COMPARE_STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<CompareState> | null;
    if (!parsed || !Array.isArray(parsed.ids)) return emptyState();
    const updatedAt = typeof parsed.updated_at === 'number' ? parsed.updated_at : 0;
    if (now - updatedAt > COMPARE_TTL_MS) return emptyState();
    const ids = parsed.ids
      .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
      .slice(0, COMPARE_MAX_IDS);
    return { ids, updated_at: updatedAt };
  } catch {
    return emptyState();
  }
}

export function writeCompare(ids: number[], now: number = Date.now()): CompareState {
  const deduped = Array.from(new Set(ids.filter((v) => Number.isFinite(v) && v > 0))).slice(
    0,
    COMPARE_MAX_IDS,
  );
  const next: CompareState = { ids: deduped, updated_at: now };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* quota / private mode — silently ignore */
    }
  }
  return next;
}

export function clearCompare(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(COMPARE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Parse a comma-separated list of ids (from URL) — used for cold-share. */
export function parseIdsCsv(raw: string | null | undefined): number[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(',')
        .map((v) => Number.parseInt(v.trim(), 10))
        .filter((v) => Number.isFinite(v) && v > 0),
    ),
  ).slice(0, COMPARE_MAX_IDS);
}

export function idsToCsv(ids: readonly number[]): string {
  return ids.join(',');
}

// ─── highlightDivergent ─────────────────────────────────────────────────────

/**
 * Type of a single comparison row — carries the *raw* values so we can tell
 * whether they diverge across properties. `id` is used as a stable key.
 */
export type CompareRow<T = unknown> = {
  id: string;
  /** One cell per property, aligned on the same indexing. */
  values: readonly T[];
};

export type HighlightedRow<T> = CompareRow<T> & {
  /** True when at least two cells carry *different* effective values. */
  divergent: boolean;
};

/**
 * Normalize a raw value for divergence comparison. We treat `null`,
 * `undefined`, empty strings and empty arrays as equivalent. Arrays are
 * compared as sorted sets (order-insensitive) so a property with
 * `[wifi, parking]` matches another with `[parking, wifi]`.
 */
function normalizeForCompare(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  if (typeof value === 'string') return value.trim() === '' ? '∅' : value.trim().toLowerCase();
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '∅';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (Array.isArray(value)) {
    if (value.length === 0) return '∅';
    return [...value]
      .map((v) => normalizeForCompare(v))
      .sort()
      .join('|');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '∅';
    }
  }
  return String(value);
}

/**
 * Tags a row as `divergent` when its cells hold more than one distinct
 * effective value (after normalization). Rows with 0 or 1 cell are always
 * non-divergent. The helper is pure — no side-effects, no sorting.
 */
export function highlightDivergent<T>(
  rows: readonly CompareRow<T>[],
): HighlightedRow<T>[] {
  return rows.map((row) => {
    if (row.values.length < 2) {
      return { ...row, divergent: false };
    }
    const signatures = new Set<string>();
    for (const value of row.values) {
      signatures.add(normalizeForCompare(value));
      if (signatures.size > 1) break;
    }
    return { ...row, divergent: signatures.size > 1 };
  });
}
