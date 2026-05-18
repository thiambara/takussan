/**
 * Universal "Publier" CTA intent persistence (TCK-254).
 *
 * The CTA must survive the auth flow — including OAuth round-trips where the
 * `?redirect=/publish` querystring may be dropped by the provider. We persist a
 * tiny localStorage flag with a short TTL so that, after auth, the `/publish`
 * page can re-evaluate and resume the routing decision.
 *
 * Server-rendered code paths must guard with `typeof window !== 'undefined'`;
 * each helper here does so internally so it is safe to call from anywhere.
 */

const STORAGE_KEY = 'publishIntent';
const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 min

type StoredIntent = {
  /** Wall-clock millis when the intent was set. */
  ts: number;
};

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Persist a fresh intent. Idempotent — overwrites any prior value. */
export function setPublishIntent(): void {
  const storage = safeStorage();
  if (!storage) return;
  const payload: StoredIntent = { ts: Date.now() };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode — silently degrade. */
  }
}

/**
 * Returns true iff a fresh intent (within TTL) is on disk. Stale entries are
 * cleared eagerly so the next read is honest.
 */
export function hasPublishIntent(ttlMs: number = DEFAULT_TTL_MS): boolean {
  const storage = safeStorage();
  if (!storage) return false;
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  let parsed: StoredIntent | null = null;
  try {
    parsed = JSON.parse(raw) as StoredIntent;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed.ts !== 'number') {
    clearPublishIntent();
    return false;
  }
  if (Date.now() - parsed.ts > ttlMs) {
    clearPublishIntent();
    return false;
  }
  return true;
}

/** Drop the persisted intent. Safe to call when nothing is set. */
export function clearPublishIntent(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const PUBLISH_INTENT_STORAGE_KEY = STORAGE_KEY;
export const PUBLISH_INTENT_DEFAULT_TTL_MS = DEFAULT_TTL_MS;
