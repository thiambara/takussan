'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import type { WelcomeSeenListResponse } from '@/types/welcome-view';

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
 *  - On mount, fetches the user's active leases (ids only) and the keys
 *    they've already acknowledged. Renders the first unseen key.
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

type LeaseListResponse = { data?: Array<{ id: number }> };

const STORAGE_KEY_PREFIX = 'tenant-welcome-';

export function useTenantWelcomeOnce(): UseTenantWelcomeOnceResult {
  const { user } = useAuth();
  const isAuthenticated = user !== null;

  const [queue, setQueue] = useState<number[]>([]);
  // Guard so we never POST twice for the same lease in a single mount.
  const acknowledgedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!isAuthenticated) return;
    let cancelled = false;
    acknowledgedRef.current = new Set();

    void (async () => {
      try {
        // Parallelise — there's no dependency between the two reads.
        const [leasesRes, seenRes] = await Promise.all([
          fetch(
            '/api/leases?filter[status]=active&fields[leases]=id&per_page=50',
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
              credentials: 'same-origin',
            },
          ),
          fetch('/api/me/welcome-seen', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          }),
        ]);
        if (cancelled) return;
        if (!leasesRes.ok || !seenRes.ok) return;

        const leasesBody = (await leasesRes.json()) as LeaseListResponse;
        const seenBody = (await seenRes.json()) as WelcomeSeenListResponse;
        if (cancelled) return;

        const leaseIds = Array.isArray(leasesBody?.data)
          ? leasesBody.data.map((l) => l.id).filter((id): id is number => typeof id === 'number')
          : [];
        const seen = new Set(Array.isArray(seenBody?.data) ? seenBody.data : []);

        const next = leaseIds.filter((id) => !seen.has(`${STORAGE_KEY_PREFIX}${id}`));
        setQueue(next);
      } catch {
        // Silent — never break the dashboard because the welcome ping failed.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const acknowledge = useCallback(
    (leaseId: number) => {
      if (acknowledgedRef.current.has(leaseId) || !isAuthenticated) return;
      acknowledgedRef.current.add(leaseId);
      void fetch('/api/me/welcome-seen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ key: `${STORAGE_KEY_PREFIX}${leaseId}` }),
      }).catch(() => {
        // Silent — server endpoint is idempotent. A missed write means the
        // modale resurfaces on the next session, which is acceptable.
      });
    },
    [isAuthenticated],
  );

  const advance = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const onComplete = useCallback(() => {
    const current = queue[0];
    if (current !== undefined) {
      acknowledge(current);
    }
    advance();
  }, [acknowledge, advance, queue]);

  const onSkip = useCallback(() => {
    const current = queue[0];
    if (current !== undefined) {
      acknowledge(current);
    }
    advance();
  }, [acknowledge, advance, queue]);

  const currentLeaseId = queue[0] ?? null;

  return {
    open: currentLeaseId !== null,
    currentLeaseId,
    onComplete,
    onSkip,
  };
}
