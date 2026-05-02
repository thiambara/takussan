/**
 * Client-side impersonation session state (TCK-145). Persisted in
 * localStorage so a refresh of `/app` keeps the banner visible until the
 * super-admin explicitly stops impersonating or the token expires.
 */

const KEY = 'takussan.impersonation';

export type ImpersonationSession = {
  token: string;
  expires_at: string; // ISO 8601
  actor_id: number;
  target_user_id: number;
  target_label?: string;
};

// Snapshot cache so `useSyncExternalStore` gets a stable referential identity
// between renders when the underlying localStorage value hasn't changed.
let cachedRaw: string | null = null;
let cachedSession: ImpersonationSession | null = null;

export function readImpersonationSession(): ImpersonationSession | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return null;
  }

  if (raw === cachedRaw) return cachedSession;
  cachedRaw = raw;

  if (!raw) {
    cachedSession = null;
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ImpersonationSession;
    if (!parsed.token || !parsed.expires_at) {
      cachedSession = null;
      return null;
    }
    if (new Date(parsed.expires_at).getTime() <= Date.now()) {
      try {
        window.localStorage.removeItem(KEY);
      } catch {
        // ignore — best effort cleanup
      }
      cachedRaw = null;
      cachedSession = null;
      return null;
    }
    cachedSession = parsed;
    return parsed;
  } catch {
    cachedSession = null;
    return null;
  }
}

export function writeImpersonationSession(session: ImpersonationSession): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('takussan:impersonation-change'));
}

export function clearImpersonationSession(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event('takussan:impersonation-change'));
}

export const IMPERSONATION_EVENT = 'takussan:impersonation-change';
