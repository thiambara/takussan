import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { OwnerOnboardingWizard } from '@/components/onboarding/OwnerOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { getToken } from '@/lib/session';

/**
 * TCK-257 — Post-acceptance landing page for an invited Owner.
 *
 * Mirror of the SP onboarding page (TCK-261) :
 *  - Auth gate redirects to login with `?redirect=/onboarding/owner`.
 *  - Pulls the user's profiles, picks the first owner profile.
 *  - Falls back to `/app` when no owner profile is attached.
 *
 * The wizard itself (status flip, KYC, OTP, recap) lives in
 * `<OwnerOnboardingWizard>`.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('owners.onboarding');
  return { title: t('metaTitle') };
}

export default async function OwnerOnboardingPage() {
  const t = await getTranslations('owners.onboarding');
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fowner');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  const owner = profilesRes.data.data.find((profile) => profile.type === 'owner');
  if (!owner) {
    redirect('/app');
  }

  return (
    <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')}>
      <OwnerOnboardingWizard ownerProfileId={owner.numeric_id} />
    </OnboardingShell>
  );
}
