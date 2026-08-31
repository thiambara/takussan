/**
 * TCK-255 — Host individual onboarding page.
 *
 * Onboards a user into their own agency. Anonymous users bounce to login.
 * Already-onboarded users (anyone with an `owner` or `agent` profile
 * attached to an agency) skip the wizard entirely and land on the
 * property-creation flow — re-running the wizard would create a duplicate
 * agency, which is never what the user wants.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { HostIndividualWizard } from '@/components/onboarding/HostIndividualWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { getToken } from '@/lib/session';
import type { ProfileType } from '@/types/profile';

/**
 * Les types de profil qui PROUVENT qu'un espace existe déjà.
 *
 * ⚠ `agency_admin` manquait, et c'est le même oubli — au même endroit du même
 * parcours — que celui de `SelectActiveProfileRequest` : l'assistant hôte crée
 * un `AgencyAdminProfile` ET un `OwnerProfile`, puis épingle le PREMIER comme
 * profil actif. Un compte dont l'`OwnerProfile` serait absent ou suspendu
 * repassait donc le garde et refaisait tourner l'assistant, sur un espace qu'il
 * possède déjà. `service_provider` n'y figure pas volontairement : il ne
 * matérialise pas l'agence personnelle que cet assistant crée. (`broker` était
 * cité ici pour la même raison ; il n'est plus un `ProfileType` depuis le
 * 2026-08-31 — TCK-495, ADR-0027.)
 */
const PROFILS_LIES_A_UNE_AGENCE = new Set<ProfileType>(['owner', 'agent', 'agency_admin']);

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.host');
  return { title: t('metaTitle') };
}

export default async function HostOnboardingPage() {
  const t = await getTranslations('onboarding.host');
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fhost');
  }

  // Skip the wizard for anyone who already holds an agency-scoped profile.
  // We rely on the profile listing rather than the legacy `user.agency_id`
  // accessor (returns null for multi-profile users, TCK-142) and we cover
  // `owner` as well as `agent` — a freshly-onboarded host carries an
  // OwnerProfile listed as `type: 'owner'`, which previously slipped past
  // the gate and let the user re-run the wizard, duplicating their agency.
  const profilesRes = await getMyProfilesAction();
  const hasAgencyProfile =
    profilesRes.ok &&
    profilesRes.data.data.some(
      (p) => PROFILS_LIES_A_UNE_AGENCE.has(p.type) && typeof p.agency_id === 'number',
    );

  if (hasAgencyProfile) {
    redirect('/app/properties/new');
  }

  return (
    <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')}>
      <HostIndividualWizard />
    </OnboardingShell>
  );
}
