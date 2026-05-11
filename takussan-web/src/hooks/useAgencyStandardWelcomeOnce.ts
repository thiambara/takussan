'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/context/AuthContext';
import { isAgencyAdmin } from '@/lib/roles';
import type { Agency } from '@/types/agency';
import type { WelcomeSeenListResponse } from '@/types/welcome-view';

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
 *     `metadata.welcome.standard_unlocked_at` set (the marker stamped by
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

type AgencyEnvelope = { data?: Agency };

const KEY_PREFIX = 'agency-standard-welcome-';

export function useAgencyStandardWelcomeOnce(): UseAgencyStandardWelcomeOnceResult {
  const { user } = useAuth();
  const isAuthenticated = user !== null;
  const agencyId = user?.agency_id ?? null;
  const eligibleRole = isAuthenticated && Array.isArray(user?.roles) && isAgencyAdmin(user.roles);

  // `dismissed` lets the user close the modale without us re-deriving
  // `open` to true on the next render — once they've acknowledged the
  // welcome key, we stay closed for the rest of the session even if the
  // hook re-evaluates eligibility.
  const [resolvedAgencyId, setResolvedAgencyId] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const acknowledgedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !eligibleRole || agencyId === null || agencyId === undefined) {
      // No setState in the synchronous return — `resolvedAgencyId` stays
      // at its current value, but `open` is gated on `agencyId === resolved`
      // below so a logged-out user / role change still hides the modale.
      return;
    }

    let cancelled = false;
    acknowledgedRef.current = false;

    void (async () => {
      try {
        // Sparse fields per CLAUDE.md API conventions — we only need to
        // know the kind + the welcome marker.
        const agencyUrl = `/api/agencies/${agencyId}?fields[agencies]=id,kind,metadata`;
        const [agencyRes, seenRes] = await Promise.all([
          fetch(agencyUrl, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          }),
          fetch('/api/me/welcome-seen', {
            method: 'GET',
            headers: { Accept: 'application/json' },
            credentials: 'same-origin',
          }),
        ]);
        if (cancelled) return;
        if (!agencyRes.ok || !seenRes.ok) return;

        const agencyBody = (await agencyRes.json()) as AgencyEnvelope;
        const seenBody = (await seenRes.json()) as WelcomeSeenListResponse;
        if (cancelled) return;

        const agency = agencyBody?.data;
        if (!agency || agency.kind !== 'standard') return;

        const unlockedAt = agency.metadata?.welcome?.standard_unlocked_at;
        if (!unlockedAt) return;

        const seen = new Set(Array.isArray(seenBody?.data) ? seenBody.data : []);
        const key = `${KEY_PREFIX}${agencyId}`;
        if (seen.has(key)) return;

        setResolvedAgencyId(agencyId);
      } catch {
        // Silent — dashboard never breaks because of a welcome ping.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, eligibleRole, agencyId]);

  // Eligibility derived from props rather than mirrored into state — no
  // sync-setState-in-effect cascade, no stale render after role / agency
  // change.
  const eligible =
    isAuthenticated &&
    eligibleRole &&
    typeof agencyId === 'number' &&
    resolvedAgencyId === agencyId &&
    !dismissed;

  const acknowledge = useCallback(() => {
    if (acknowledgedRef.current || resolvedAgencyId === null || !isAuthenticated) return;
    acknowledgedRef.current = true;
    void fetch('/api/me/welcome-seen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ key: `${KEY_PREFIX}${resolvedAgencyId}` }),
    }).catch(() => {
      // Silent — the server is idempotent. A missed write only means we
      // re-prompt the next session.
    });
  }, [resolvedAgencyId, isAuthenticated]);

  const onComplete = useCallback(() => {
    acknowledge();
    setDismissed(true);
  }, [acknowledge]);

  const onSkip = useCallback(() => {
    acknowledge();
    setDismissed(true);
  }, [acknowledge]);

  return {
    open: eligible,
    agencyId: eligible ? resolvedAgencyId : null,
    onComplete,
    onSkip,
  };
}
