import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { OwnerOnboardingWizard } from '@/components/onboarding/OwnerOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { profilAReprendre } from '@/lib/onboarding-reprise';
import { fetchInterlocuteurDuBailleur } from '@/lib/owner-onboarding';
import type { MesPiecesResponse } from '@/lib/pieces/pieces';

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

  // TCK-2614 (décision 2b) — les pièces de CE profil (`X-Profile-Id`), dont le NINEA requis d'une société seule ;
  // TCK-2613 — l'écran 2 les rappelle, sans en exiger aucune. Un échec de lecture ne rappelle rien.
  // TCK-2838 — l'interlocuteur à l'agence, lu ici (une lecture serveur, pas une action de plus à l'écran 2).
  // Un échec de lecture ne montre aucune carte.
  const [pieces, interlocuteur] = await Promise.all([
    apiRequest<MesPiecesResponse>('/api/me/pieces', {
      token,
      headers: { 'X-Profile-Id': `owner:${owner.numeric_id}` },
    }).catch(() => null),
    fetchInterlocuteurDuBailleur(token, owner.numeric_id)
      .then((res) => res.data)
      .catch(() => null),
  ]);

  // TCK-2613 — deux écrans dans la coque d'entrée : chaque écran porte son titre, la barre dit l'agence et l'étape.
  return (
    <OnboardingShell brouillon sortie="quitter" largeur="assistant">
      <OwnerOnboardingWizard
        ownerProfileId={owner.numeric_id}
        agence={owner.agency?.name ?? null}
        pieces={pieces?.data ?? null}
        interlocuteur={interlocuteur}
      />
    </OnboardingShell>
  );
}
