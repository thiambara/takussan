import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { AgentOnboardingWizard } from '@/components/onboarding/AgentOnboardingWizard';
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

export const metadata: Metadata = {
  title: 'Onboarding agent',
};

export default async function AgentOnboardingPage() {
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
    <main className="min-h-[80vh] bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Bienvenue dans votre espace agent
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Quatre étapes guidées pour vérifier votre identité, transmettre vos
            pièces et configurer votre périmètre d&apos;activité.
          </p>
        </header>

        <AgentOnboardingWizard agentProfileId={agent.numeric_id} />
      </div>
    </main>
  );
}
