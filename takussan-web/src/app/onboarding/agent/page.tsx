import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { AgentOnboardingWizard } from '@/components/onboarding/AgentOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { getToken } from '@/lib/session';

/**
 * TCK-259 — Post-acceptance landing page for an invited Agent.
 *
 * Mirror of the Owner onboarding page (TCK-257) :
 *  - Auth gate redirects to login with `?redirect=/onboarding/agent`.
 *  - Pulls the user's profiles, picks the first agent profile.
 *  - Falls back to `/app` when no agent profile is attached.
 *
 * The wizard itself (status flip, KYC, OTP, specialization, welcome)
 * lives in `<AgentOnboardingWizard>`.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('agents.onboarding');
  return { title: t('metaTitle') };
}

export default async function AgentOnboardingPage() {
  const t = await getTranslations('agents.onboarding');
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fagent');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  const agent = profilesRes.data.data.find((profile) => profile.type === 'agent');
  if (!agent) {
    redirect('/app');
  }

  // The invited role (agent / agent_senior / agent_manager) is encoded
  // in the profile metadata at invite time (AgentInvitationService).
  // The current `/api/me/profiles` projection does not surface metadata,
  // so the wizard defaults to the base `agent` permission set — a
  // dedicated endpoint will refine the role label in a follow-up. The
  // recap step is purely informational and never gates onboarding.

  return (
    <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')}>
      <AgentOnboardingWizard agentProfileId={agent.numeric_id} />
    </OnboardingShell>
  );
}
