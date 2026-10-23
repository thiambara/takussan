'use client';

import { useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { isAgencyAdmin } from '@/lib/roles';
import { useAccueilsVus } from '@/hooks/useAccueilsVus';

/**
 * TCK-269 — Drives the one-shot "Welcome to your standard agency" modale
 * triggered when a super-admin has approved the agency upgrade request.
 *
 * Mirror of `useTenantWelcomeOnce` (TCK-265) but agency-scoped.
 *
 * Trigger conditions (all must be true):
 *  1. The user is authenticated.
 *  2. The user holds the `agency_admin` role (strict — excludes super-admin
 *     impersonation, mirrors `isAgencyAdmin` in `lib/roles.ts`).
 *  3. The user has an `agency_id`.
 *  4. The active agency is `kind = standard` AND has
 *     `metadata.welcome.standard_unlocked_at` set (passed by the `/app` layout,
 *     TCK-1766) (the marker stamped by
 *     `AgencyKindFlipService` at flip time — agencies that have always
 *     been standard never see this modale).
 *  5. The welcome key `agency-standard-welcome-{agency_id}` is not yet
 *     in the user's `welcome_views` (per-user persistence — different
 *     admins of the same agency each see it once).
 *
 * On dismiss / completion, POSTs the key to `/api/me/welcome-seen`
 * (idempotent server-side) and closes locally. Network failures are
 * silent — a missed write means the modale resurfaces on next session,
 * which is preferable to crashing the dashboard.
 */
export type UseAgencyStandardWelcomeOnceResult = {
  open: boolean;
  agencyId: number | null;
  onComplete: () => void;
  onSkip: () => void;
};

/**
 * TCK-1766 (P136.03) — le marqueur d'accueil de l'agence, lu par le layout `/app` qui a déjà
 * l'agence (`resolveAgencyOrNull`, mise en cache pour le rendu). `unlockedAt` est
 * `metadata.welcome.standard_unlocked_at` d'une agence `standard`, `null` sinon. Le hook ne relit
 * plus `GET /api/agencies/{id}` : avant, il demandait la ressource de détail entière pour ces deux
 * champs.
 */
export type MarqueurAccueilAgence = {
  readonly agencyId: number;
  readonly unlockedAt: string | null;
};

const KEY_PREFIX = 'agency-standard-welcome-';

export function useAgencyStandardWelcomeOnce(
  marqueur?: MarqueurAccueilAgence | null,
): UseAgencyStandardWelcomeOnceResult {
  const { user } = useAuth();
  const isAuthenticated = user !== null;
  const agencyId = user?.agency_id ?? null;
  const eligibleRole = isAuthenticated && Array.isArray(user?.roles) && isAgencyAdmin(user.roles);

  // Le marqueur ne vaut que pour l'agence du profil actif : après un changement de profil, un
  // marqueur d'une autre agence n'ouvre rien.
  const actif =
    eligibleRole &&
    typeof agencyId === 'number' &&
    marqueur?.agencyId === agencyId &&
    !!marqueur.unlockedAt;
  const { vus, marquerVu } = useAccueilsVus(actif);
  const key = `${KEY_PREFIX}${agencyId}`;

  // `dismissed` lets the user close the modale without us re-deriving
  // `open` to true on the next render — once they've acknowledged the
  // welcome key, we stay closed for the rest of the session.
  const [dismissed, setDismissed] = useState(false);
  const acknowledgedRef = useRef(false);

  const eligible = actif && vus !== null && !vus.includes(key) && !dismissed;

  const acknowledge = () => {
    if (acknowledgedRef.current || !actif) return;
    acknowledgedRef.current = true;
    marquerVu(key);
  };

  const onComplete = () => {
    acknowledge();
    setDismissed(true);
  };

  const onSkip = () => {
    acknowledge();
    setDismissed(true);
  };

  return {
    open: eligible,
    agencyId: eligible ? agencyId : null,
    onComplete,
    onSkip,
  };
}
