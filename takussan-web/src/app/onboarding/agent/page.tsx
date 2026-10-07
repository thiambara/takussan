import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { AgentOnboardingWizard } from '@/components/onboarding/AgentOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { getToken } from '@/lib/session';
import { profilAReprendre } from '@/lib/onboarding-reprise';

/**
 * TCK-259 — Post-acceptance landing page for an invited Agent.
 *
 * Mirror of the Owner onboarding page (TCK-257) :
 *  - Auth gate redirects to login with `?redirect=/onboarding/agent`.
 *  - Pulls the user's profiles, picks the one named by `?agent=` (lien de reprise), else the
 *    first agent profile still to complete (TCK-589, `profilAReprendre`).
 *  - Falls back to `/app` when there is none.
 *
 * The wizard itself (status flip, KYC, OTP, specialization, welcome)
 * lives in `<AgentOnboardingWizard>`.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agents.onboarding');
  return { title: t('metaTitle') };
}

export default async function AgentOnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ agent?: string | string[] }>;
}) {
  const t = await getTranslations('agents.onboarding');
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fagent');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  const agent = profilAReprendre(profilesRes.data.data, 'agent', (await searchParams).agent);
  if (!agent) {
    redirect('/app');
  }

  // TCK-589 — le récap lit les capacités RÉELLES de l'agent dans l'agence de l'invitation
  // (`/api/me/capabilities?agency_id=`) ; il ne retombe plus sur une table écrite en dur.

  return (
    <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')}>
      <AgentOnboardingWizard agentProfileId={agent.numeric_id} agencyId={agent.agency_id} />
    </OnboardingShell>
  );
}
