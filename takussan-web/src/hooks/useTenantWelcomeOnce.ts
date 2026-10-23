'use client';

import { useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { useActiveLeaseSummaries } from '@/lib/queries/leases-active-summaries';
import { useAccueilsVus } from '@/hooks/useAccueilsVus';

/**
 * TCK-265 — Drives the one-shot tenant welcome modale, scoped per lease.
 *
 * Unlike `useWelcomeOnce` (TCK-251) which tracks a single welcome key,
 * this hook serialises a queue of unseen `tenant-welcome-{lease_id}`
 * keys: one per currently-active lease. When a tenant has just signed
 * a second bail, both modales are shown sequentially the next time they
 * land on the dashboard.
 *
 * Behaviour:
 *  - Skips entirely if the user is anonymous.
 *  - On mount, reads the user's active leases (ids only, through the Laravel
 *    API) and the keys they've already acknowledged (BFF relay). Renders the
 *    first unseen key.
 *  - On skip OR completion, POSTs the current key to `/api/me/welcome-seen`
 *    (idempotent server-side) and shifts to the next key in the queue.
 *
 * The returned `currentLeaseId` lets the consumer key its modale title /
 * body to the right bail (multi-bail tenants).
 */
export type UseTenantWelcomeOnceResult = {
  open: boolean;
  currentLeaseId: number | null;
  onComplete: () => void;
  onSkip: () => void;
};

const STORAGE_KEY_PREFIX = 'tenant-welcome-';

export function useTenantWelcomeOnce(): UseTenantWelcomeOnceResult {
  const { user } = useAuth();
  const isAuthenticated = user !== null;

  // TCK-968 — les baux actifs par l'API Laravel. Le `fetch` relatif vers `/api/leases` d'avant visait
  // le serveur Next, qui n'a pas ce relais : la modale ne s'ouvrait jamais.
  const leasesQuery = useActiveLeaseSummaries(isAuthenticated);
  // TCK-1766 (P136.03) — les clés vues viennent de la lecture partagée de la coque ; une lecture
  // en échec laisse la file vide, comme avant.
  const { vus, marquerVu } = useAccueilsVus(isAuthenticated);
  const seen = vus === null ? null : new Set(vus);
  // Leases dismissed during this mount: the queue is derived, they leave it.
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(new Set());
  // Guard so we never POST twice for the same lease in a single mount.
  const acknowledgedRef = useRef<Set<number>>(new Set());

  const leases = leasesQuery.data?.data;
  const queue =
    isAuthenticated && seen !== null && Array.isArray(leases)
      ? leases
          .map((l) => l.id)
          .filter((id): id is number => typeof id === 'number')
          .filter((id) => !seen.has(`${STORAGE_KEY_PREFIX}${id}`) && !dismissed.has(id))
      : [];
  const currentLeaseId = queue[0] ?? null;

  const acknowledge = (leaseId: number) => {
    if (acknowledgedRef.current.has(leaseId) || !isAuthenticated) return;
    acknowledgedRef.current.add(leaseId);
    marquerVu(`${STORAGE_KEY_PREFIX}${leaseId}`);
  };

  const advance = (leaseId: number) => {
    setDismissed((d) => new Set(d).add(leaseId));
  };

  const onComplete = () => {
    if (currentLeaseId === null) return;
    acknowledge(currentLeaseId);
    advance(currentLeaseId);
  };

  const onSkip = () => {
    if (currentLeaseId === null) return;
    acknowledge(currentLeaseId);
    advance(currentLeaseId);
  };

  return {
    open: currentLeaseId !== null,
    currentLeaseId,
    onComplete,
    onSkip,
  };
}
