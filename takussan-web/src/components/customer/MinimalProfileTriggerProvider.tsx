'use client';

import dynamic from 'next/dynamic';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';

import { MinimalProfileTriggerContext } from '@/hooks/useTriggerMinimalProfileOnce';
import { useDejaOuvert } from '@/hooks/useDejaOuvert';
import type { MinimalProfilePayload } from './CustomerMinimalProfileSheet';
import { useAccueilsVus } from '@/hooks/useAccueilsVus';
import { isCustomerOnly } from '@/lib/roles';

/**
 * TCK-253 — Mounts the minimal-profile sheet once at the dashboard shell
 * and exposes `triggerIfNeeded()` to descendants.
 *
 * Behaviour:
 * - On mount (Customer role only), pre-fetches `/api/me/welcome-seen` (shared
 *   with the shell's welcome wizards, `useAccueilsVus`, TCK-1766) so
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
  // Use the SSR-resolved roles here rather than the client `user` object —
  // the latter rehydrates asynchronously and would let the very first
  // sensitive click slip through unchecked.
  // TCK-492 — customer-ONLY : la feuille de profil minimal de TCK-253 vise
  // l'acheteur qui vient de s'inscrire, pas l'agent qui a un compte.
  const enabled = isCustomerOnly(roles as never);

  const [open, setOpen] = useState(false);
  // Remember whether we've already opened the sheet in this session so we
  // never re-open it after the user dismissed it (the server write is
  // fire-and-forget; we don't want to wait for it before short-circuiting).
  const consumedRef = useRef(false);

  // TCK-1766 (P136.03) — la lecture des clés vues est partagée avec les assistants de la coque
  // (une seule par chargement) et suit le compte, pas l'objet `user` (TCK-1764). Une lecture en
  // échec vaut « vue » : on ne harcèle pas un compte qu'on ne sait pas suivre.
  const { vus, echec, marquerVu } = useAccueilsVus(enabled);
  const [vueIci, setVueIci] = useState(false);
  const seen: boolean | null = vueIci || echec ? true : vus === null ? null : vus.includes(WELCOME_KEY);

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

  const handleClose = () => {
    setOpen(false);
    marquerVu(WELCOME_KEY);
    setVueIci(true);
  };

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
