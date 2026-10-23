'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { MinimalProfileTriggerContext } from '@/hooks/useTriggerMinimalProfileOnce';
import { useDejaOuvert } from '@/hooks/useDejaOuvert';
import type { MinimalProfilePayload } from './CustomerMinimalProfileSheet';
import { useAuth } from '@/context/AuthContext';
import type { WelcomeSeenListResponse } from '@/types/welcome-view';
import { isCustomerOnly } from '@/lib/roles';

/**
 * TCK-253 — Mounts the minimal-profile sheet once at the dashboard shell
 * and exposes `triggerIfNeeded()` to descendants.
 *
 * Behaviour:
 * - On mount (Customer role only), pre-fetches `/api/me/welcome-seen` so
 *   the in-memory `seen` flag is ready before the user fires any sensitive
 *   action. We never block on this — `triggerIfNeeded()` simply does
 *   nothing if the fetch is in flight.
 * - The sheet is shown at most once per browser tab lifecycle: as soon as
 *   it opens, we treat the key as locally consumed.
 * - On close (skip OR save), POSTs the welcome key — same idempotent
 *   contract as the welcome modale.
 */

const WELCOME_KEY = 'customer-profile-minimal';

// TCK-1089 (P70.05) — chargée à sa première ouverture : importée statiquement, la feuille
// apportait seule `@base-ui/react/select` au JS initial de chaque écran de `/app`.
const CustomerMinimalProfileSheet = dynamic(() =>
  import('./CustomerMinimalProfileSheet').then((m) => m.CustomerMinimalProfileSheet),
);

export type MinimalProfileTriggerProviderProps = {
  children: ReactNode;
  /**
   * Roles of the current user. The provider only becomes "active" for
   * Customers — for any other role it renders children as-is and the
   * `triggerIfNeeded()` exposed by `useTriggerMinimalProfileOnce` falls
   * back to the no-op default.
   */
  roles: string[];
};

export function MinimalProfileTriggerProvider({
  children,
  roles,
}: MinimalProfileTriggerProviderProps) {
  const { user } = useAuth();
  // Use the SSR-resolved roles here rather than the client `user` object —
  // the latter rehydrates asynchronously and would let the very first
  // sensitive click slip through unchecked.
  // TCK-492 — customer-ONLY : la feuille de profil minimal de TCK-253 vise
  // l'acheteur qui vient de s'inscrire, pas l'agent qui a un compte.
  const enabled = isCustomerOnly(roles as never);

  const [seen, setSeen] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  // Remember whether we've already opened the sheet in this session so we
  // never re-open it after the user dismissed it (the server write is
  // fire-and-forget; we don't want to wait for it before short-circuiting).
  const consumedRef = useRef(false);

  // TCK-1764 (P172.04) — le compte, pas l'objet `user` que chaque `refreshUser()` remplace.
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!enabled || userId === null) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/me/welcome-seen', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (cancelled) return;
        if (!res.ok) {
          // 401 / 5xx — be conservative: assume seen so we never spam a
          // user we can't track.
          setSeen(true);
          return;
        }
        const body = (await res.json()) as WelcomeSeenListResponse;
        const list = Array.isArray(body?.data) ? body.data : [];
        setSeen(list.includes(WELCOME_KEY));
      } catch {
        setSeen(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, userId]);

  const markSeenRemote = useCallback(() => {
    void fetch('/api/me/welcome-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key: WELCOME_KEY }),
    }).catch(() => {
      // Idempotent on the server — silent retry on next session if needed.
    });
  }, []);

  const triggerIfNeeded = useCallback(() => {
    if (!enabled) return;
    if (consumedRef.current) return;
    // If we don't yet know whether the key is seen, err on the side of
    // not bothering the user — the sheet will simply not appear on this
    // first action, but will be primed for the next one.
    if (seen === null || seen) return;
    consumedRef.current = true;
    setOpen(true);
  }, [enabled, seen]);

  const handleClose = useCallback(() => {
    setOpen(false);
    markSeenRemote();
    setSeen(true);
  }, [markSeenRemote]);

  const handleSave = useCallback(async (payload: MinimalProfilePayload) => {
    const res = await fetch('/api/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      // Surface a generic error — the sheet keeps the form filled so the
      // user can retry without retyping.
      throw new Error('save_failed');
    }
  }, []);

  const value = useMemo(() => ({ triggerIfNeeded }), [triggerIfNeeded]);
  const monte = useDejaOuvert(open);

  return (
    <MinimalProfileTriggerContext.Provider value={value}>
      {children}
      {enabled && monte ? (
        <CustomerMinimalProfileSheet
          open={open}
          onClose={handleClose}
          onSave={handleSave}
        />
      ) : null}
    </MinimalProfileTriggerContext.Provider>
  );
}
