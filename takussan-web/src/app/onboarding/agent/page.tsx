import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { AgentOnboardingWizard } from '@/components/onboarding/AgentOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { profilAReprendre } from '@/lib/onboarding-reprise';
import type { MesPiecesResponse } from '@/lib/pieces/pieces';

/**
 * TCK-259 — Post-acceptance landing page for an invited Agent.
 *
 * Mirror of the Owner onboarding page (TCK-257) :
 *  - Auth gate redirects to login with `?redirect=/onboarding/agent`.
 *  - Pulls the user's profiles, picks the one named by `?agent=` (lien de reprise), else the
 *    first agent profile still to complete (TCK-589, `profilAReprendre`).
 *  - Falls back to `/app` when there is none.
 *
 * The wizard itself (status flip, OTP, first lead, zones) lives in `<AgentOnboardingWizard>` — deux écrans depuis
 * TCK-2613.
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

  // TCK-589 — les droits lus sont ceux que le RÔLE de ce profil accordera
  // (`/api/me/agent-profiles/{id}/role-capabilities`) ; ils ne retombent plus sur une table écrite en dur.
  // TCK-2613 — les pièces de CE profil (`X-Profile-Id`) : l'écran 2 rappelle celles qui restent, sans en exiger
  // aucune. Un échec de lecture ne rappelle rien.
  const pieces = await apiRequest<MesPiecesResponse>('/api/me/pieces', {
    token,
    headers: { 'X-Profile-Id': `agent:${agent.numeric_id}` },
  }).catch(() => null);

  // TCK-2613 — deux écrans dans la coque d'entrée : chaque écran porte son titre, la barre dit l'agence et l'étape.
  return (
    <OnboardingShell brouillon sortie="quitter" largeur="assistant">
      <AgentOnboardingWizard
        agentProfileId={agent.numeric_id}
        agence={agent.agency?.name ?? null}
        specialite={agent.specialty ?? null}
        pieces={pieces?.data ?? null}
      />
    </OnboardingShell>
  );
}
