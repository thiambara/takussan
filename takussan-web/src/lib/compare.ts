/**
 * TCK-082 — localStorage persistence + helpers for the property comparator.
 *
 * Storage contract:
 *   Key:    `takussan.compare.v1`
 *   Value:  `{ ids: number[]; previews: Record<id, ComparePreview>; updated_at: number }`
 *   TTL:    24h — anything older is treated as empty on read.
 *   Cap:    4 ids — writes that exceed are refused (caller should toast).
 *
 * ## Pourquoi un APERÇU vit à côté des ids
 *
 * La barre flottante affichait `#183` — l'identifiant de base, qui ne veut rien dire pour
 * qui compare deux villas. Le rendre lisible demande un titre et une vignette, et il n'y a
 * que deux façons de les obtenir : les REDEMANDER à l'API sur chaque page où la barre est
 * montée, ou les GARDER au moment où l'utilisateur clique — moment où l'appelant les a déjà
 * sous la main (la carte les affiche, la fiche aussi).
 *
 * On les garde. La barre rend alors sans requête, sans état de chargement et sans clignotement,
 * y compris hors ligne. Le champ est FACULTATIF à la lecture : un état écrit par une version
 * antérieure (ids seuls) reste valide, et la barre retombe sur l'initiale du titre absent.
 */

export const COMPARE_STORAGE_KEY = 'takussan.compare.v1';
export const COMPARE_MAX_IDS = 4;
export const COMPARE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * L'instantané d'un bien, tel que la barre flottante en a besoin — et rien de plus.
 *
 * Volontairement sans prix : la vignette fait 56 px, et un prix qu'on ne peut pas lire est
 * du poids de stockage payé pour rien. Le prix se lit sur `/compare`, qui va le chercher.
 */
export type ComparePreview = {
  title: string;
  slug: string;
  photo: string | null;
};

export type ComparePreviews = Record<number, ComparePreview>;

export type CompareState = {
  ids: number[];
  previews: ComparePreviews;
  updated_at: number;
};

function emptyState(): CompareState {
  return { ids: [], previews: {}, updated_at: Date.now() };
}

/**
 * Un aperçu venu du stockage est de la donnée non fiable comme le reste de l'état : on ne
 * garde que ce dont la forme est vérifiée, et jamais l'objet tel quel.
 */
function sanitizePreviews(raw: unknown, ids: readonly number[]): ComparePreviews {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: ComparePreviews = {};
  for (const id of ids) {
    const candidate = (raw as Record<string, unknown>)[String(id)];
    if (!candidate || typeof candidate !== 'object') continue;
    const { title, slug, photo } = candidate as Record<string, unknown>;
    if (typeof title !== 'string' || typeof slug !== 'string') continue;
    out[id] = {
      title,
      slug,
      photo: typeof photo === 'string' && photo !== '' ? photo : null,
    };
  }
  return out;
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
    return { ids, previews: sanitizePreviews(parsed.previews, ids), updated_at: updatedAt };
  } catch {
    return emptyState();
  }
}

export function writeCompare(
  ids: number[],
  now: number = Date.now(),
  previews: ComparePreviews = {},
): CompareState {
  const deduped = Array.from(new Set(ids.filter((v) => Number.isFinite(v) && v > 0))).slice(
    0,
    COMPARE_MAX_IDS,
  );
  // Un aperçu dont l'id n'est plus sélectionné n'a plus de lecteur : il sortirait du
  // stockage sans que rien ne l'y remette, et grossirait indéfiniment.
  const retained: ComparePreviews = {};
  for (const id of deduped) {
    const preview = previews[id];
    if (preview) retained[id] = preview;
  }
  const next: CompareState = { ids: deduped, previews: retained, updated_at: now };
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
