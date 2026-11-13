/**
 * TCK-626 — `/invitations/accept?token=…`, la page que l'e-mail et le SMS d'invitation ouvrent.
 *
 * Elle n'existait pas : le lien (`InvitationMailable`) menait à une 404, et l'acceptation
 * (`POST /api/invitations/{token}/accept`, publique depuis TCK-249) n'avait aucun appelant.
 *
 * TCK-2611 (ADR-0094) — la page LIT l'invitation avant de rien demander (`GET
 * /api/public/invitations/{token}`, au rendu serveur, lecture seule) : l'agence, la personne qui invite
 * et le rôle en tête, puis l'entrée par code ; un lien expiré, annulé, déjà accepté ou inconnu a son
 * écran, sans formulaire. Aucune requête qui accepte au rendu.
 */
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { lireInvitation } from '@/lib/invitation-apercu';
import { lireNomsPreremplis } from '@/lib/invitation-prerempli';
import { getToken } from '@/lib/session';

import { EcranFerme } from './EcranFerme';
import { EntreeDInvitation } from './EntreeDInvitation';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invitationAccept');
  // ADR-0094 § 3 — le jeton est un secret porteur : aucun `Referer` ne l'emporte (la balise pour le
  // HTML, l'en-tête dans `next.config.ts` pour toute réponse du chemin).
  return { title: t('metaTitle'), referrer: 'no-referrer' };
}

export default async function PageAccepterInvitation({
  searchParams,
}: {
  readonly searchParams: Promise<{ token?: string }>;
}) {
  const { token: jeton } = await searchParams;

  if (!jeton) {
    return (
      <OnboardingShell largeur="etroite">
        <EcranFerme etat="incomplet" />
      </OnboardingShell>
    );
  }

  const session = await getToken();
  const lecture = await lireInvitation(jeton);

  if (lecture.issue !== 'valide') {
    return (
      <OnboardingShell largeur="etroite">
        {lecture.issue === 'fermee' ? (
          <EcranFerme etat={lecture.fermee.etat} fermee={lecture.fermee} jeton={jeton} />
        ) : (
          <EcranFerme etat={lecture.issue} />
        )}
      </OnboardingShell>
    );
  }

  // P220.07 (TCK-2281) — connecté et sans nom, le compte confirme le nom saisi par l'agence.
  const prerempli = session ? await lireNomsPreremplis(jeton, session) : null;

  return (
    <OnboardingShell largeur="etroite">
      <EntreeDInvitation jeton={jeton} connecte={Boolean(session)} apercu={lecture.apercu} prerempliDuCompte={prerempli} />
    </OnboardingShell>
  );
}
