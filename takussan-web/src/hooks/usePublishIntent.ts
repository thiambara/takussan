'use client';

/**
 * TCK-254 — Universal "Publier" CTA router.
 *
 * Evaluates the current user state and returns a routing decision so the
 * `/publish` page (or any caller) can replace the URL accordingly.
 *
 * Decision matrix:
 * - Anonymous          → /auth/login?redirect=/publish
 * - Authenticated, no agency profile and not agency_admin → /onboarding/host
 *   (placeholder for TCK-255 wizard)
 * - Authenticated, exactly 1 agency      → /app/properties/new
 * - Authenticated, several agencies      → /app?selectProfile=true (sentinel
 *   for the existing profile switcher; the user picks, we re-land here on
 *   next click).
 *
 * The hook is read-only: it does NOT navigate, NOR mutate the active profile
 * (TCK-255 owns that side-effect when the wizard creates the agency).
 */

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useMyProfiles } from '@/hooks/useProfiles';
import type { Profile } from '@/types/profile';
import type { User } from '@/types/user';

export type PublishIntentStatus =
  | 'loading'
  | 'anonymous'
  | 'host-needed'
  | 'single-agency'
  | 'multi-agency';

export type PublishIntentDecision = {
  status: PublishIntentStatus;
  /**
   * Where the caller should send the user. `null` only while loading.
   */
  target: string | null;
  /**
   * Distinct agency_ids the user is admin/agent of (post-dedup). Useful for
   * tests and for the multi-agency picker UX.
   */
  agencyIds: number[];
  /**
   * The single resolved agency_id when the user has exactly one. `null`
   * otherwise. Carries the value the caller may want to switch the active
   * profile to before navigating.
   */
  resolvedAgencyId: number | null;
};

const LOGIN_TARGET = '/auth/login?redirect=/publish';
const HOST_WIZARD_TARGET = '/onboarding/host';
const NEW_PROPERTY_TARGET = '/app/properties/new';
const PROFILE_PICKER_TARGET = '/app?selectProfile=true&next=/publish';

/**
 * Collect the agency_ids the user can publish under. We treat any
 * `agent` profile with an agency_id as qualifying, plus — if the user carries
 * the `agency_admin` role and a top-level `agency_id` — that agency too.
 *
 * `service_provider` profiles are intentionally excluded: per §1.12, only
 * agency_admin/agent profiles host listings. (`broker` figurait ici jusqu'au
 * 2026-08-31 ; il n'est plus un `ProfileType` — TCK-495, ADR-0027.)
 */
function collectAgencyIds(user: User | null, profiles: Profile[] | undefined): number[] {
  const ids = new Set<number>();
  if (user?.roles.includes('agency_admin') && typeof user.agency_id === 'number') {
    ids.add(user.agency_id);
  }
  for (const p of profiles ?? []) {
    if (p.type === 'agent' && typeof p.agency_id === 'number') {
      ids.add(p.agency_id);
    }
  }
  return Array.from(ids);
}

export function decidePublishIntent(
  user: User | null,
  profiles: Profile[] | undefined,
  isLoading: boolean,
): PublishIntentDecision {
  if (isLoading) {
    return { status: 'loading', target: null, agencyIds: [], resolvedAgencyId: null };
  }
  if (!user) {
    return {
      status: 'anonymous',
      target: LOGIN_TARGET,
      agencyIds: [],
      resolvedAgencyId: null,
    };
  }
  const agencyIds = collectAgencyIds(user, profiles);
  if (agencyIds.length === 0) {
    return {
      status: 'host-needed',
      target: HOST_WIZARD_TARGET,
      agencyIds: [],
      resolvedAgencyId: null,
    };
  }
  if (agencyIds.length === 1) {
    return {
      status: 'single-agency',
      target: NEW_PROPERTY_TARGET,
      agencyIds,
      resolvedAgencyId: agencyIds[0],
    };
  }
  return {
    status: 'multi-agency',
    target: PROFILE_PICKER_TARGET,
    agencyIds,
    resolvedAgencyId: null,
  };
}

export function usePublishIntent(): PublishIntentDecision {
  const { user, isLoading: authLoading } = useAuth();
  // `useMyProfiles` is gated on `!!user`. When anonymous, the query is
  // disabled and `data` stays undefined — that's correct: we short-circuit
  // before reading profiles.
  const profilesQuery = useMyProfiles();
  const isLoading =
    authLoading || (!!user && profilesQuery.isLoading && !profilesQuery.data);

  return useMemo(
    () => decidePublishIntent(user, profilesQuery.data?.data, isLoading),
    [user, profilesQuery.data, isLoading],
  );
}

// Exported for tests so they can assert against canonical targets without
// reaching into the module internals.
export const PUBLISH_TARGETS = {
  login: LOGIN_TARGET,
  hostWizard: HOST_WIZARD_TARGET,
  newProperty: NEW_PROPERTY_TARGET,
  profilePicker: PROFILE_PICKER_TARGET,
} as const;
