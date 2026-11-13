import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { OwnerOnboardingWizard } from '@/components/onboarding/OwnerOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { profilAReprendre } from '@/lib/onboarding-reprise';
import { nineaRequis, type MesPiecesResponse } from '@/lib/pieces/pieces';

/**
 * TCK-257 — Post-acceptance landing page for an invited Owner.
 *
 * Mirror of the SP onboarding page (TCK-261) :
 *  - Auth gate redirects to login with `?redirect=/onboarding/owner`.
 *  - Pulls the user's profiles, picks the one named by `?owner=` (lien de reprise), else the
 *    first owner profile still to complete (TCK-589, `profilAReprendre`).
 *  - Falls back to `/app` when there is none.
 *
 * The wizard itself (status flip, KYC, OTP, recap) lives in
 * `<OwnerOnboardingWizard>`.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('owners.onboarding');
  return { title: t('metaTitle') };
}

export default async function OwnerOnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ owner?: string | string[] }>;
}) {
  const t = await getTranslations('owners.onboarding');
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fowner');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  const owner = profilAReprendre(profilesRes.data.data, 'owner', (await searchParams).owner);
  if (!owner) {
    redirect('/app');
  }

  // TCK-2614 (décision 2b) — le NINEA n'est requis que d'une société : l'API le dit pour CE profil (`X-Profile-Id`),
  // l'assistant ne refait pas la règle. Un échec de lecture le laisse requis (le comportement d'avant).
  const pieces = await apiRequest<MesPiecesResponse>('/api/me/pieces', {
    token,
    headers: { 'X-Profile-Id': `owner:${owner.numeric_id}` },
  }).catch(() => null);

  return (
    <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')} brouillon>
      <OwnerOnboardingWizard ownerProfileId={owner.numeric_id} nineaRequis={nineaRequis(pieces?.data)} />
    </OnboardingShell>
  );
}
