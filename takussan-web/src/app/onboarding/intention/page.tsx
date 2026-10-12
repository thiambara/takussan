/**
 * TCK-493 — la question d'orientation posée juste après la création du compte.
 *
 * **Ce qu'elle remplace.** `OAuthProvisioningService::provision()` crée un
 * compte sans aucun profil ; le callback OAuth redirigeait ensuite en dur vers
 * `/app`, c'est-à-dire un tableau de bord qui n'affiche rien et ne demande rien.
 * Le chemin e-mail, lui, passait au moins par une étape — et l'asymétrie était
 * le point : le parcours le plus court menait au plus vide.
 *
 * ⚠ **Toute la décision « faut-il poser la question ? » vit ICI, et nulle part
 * ailleurs.** Les quatre chemins d'inscription redirigent inconditionnellement
 * vers cette page, qui renvoie plus loin quand elle n'a rien à demander. Répartir
 * ce jugement sur quatre appelants serait le motif que ce dépôt paie depuis
 * TCK-329 : une règle recopiée est juste le jour où on l'écrit.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { getMyProfilesAction } from '@/app/actions/profiles';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { QuestionDIntention } from '@/components/onboarding/QuestionDIntention';
import { EtapePrenom } from '@/components/onboarding/EtapePrenom';
import {
  avecRedirection,
  DESTINATION_PAR_DEFAUT,
  destinationInterne,
  doitPoserLaQuestionDIntention,
  estUneDestinationExplicite,
} from '@/lib/redirection-interne';
import { getToken } from '@/lib/session';
import { prenomDe } from '@/lib/identite';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding.intention');
  return { title: t('metaTitle') };
}

export default async function PageDIntention({
  searchParams,
}: {
  readonly searchParams: Promise<{ redirect?: string }>;
}) {
  const t = await getTranslations('onboarding.intention');
  const { redirect: brute } = await searchParams;
  // Le filtre est PARTAGÉ avec le callback OAuth (`lib/redirection-interne.ts`) :
  // cette page reçoit le paramètre de quatre chemins d'inscription, et un
  // contrôle de sécurité recopié n'est corrigé qu'à un seul endroit.
  const demandee = destinationInterne(brute, '');
  const apres = demandee || DESTINATION_PAR_DEFAUT;

  const token = await getToken();
  if (!token) {
    // TCK-624 — la destination survit : la connexion ramène ici, avec elle.
    redirect(avecRedirection('/auth/login', demandee));
  }

  const user = await getMeAction();
  const prenom = prenomDe(user);

  // TCK-624 — la PORTE UNIQUE de sortie de l'authentification. Elle demande ce qui manque, dans
  // l'ordre : un prénom (un compte ouvert par téléphone ou par OAuth n'en a pas), puis — seulement
  // si la destination ne dit pas déjà ce que la personne vient faire — l'orientation.
  if (!prenom) {
    return (
      <OnboardingShell title={t('name.title')} subtitle={t('name.subtitle')}>
        <EtapePrenom />
      </OnboardingShell>
    );
  }

  const profils = await getMyProfilesAction();

  // La règle est dans `lib/redirection-interne.ts` pour être éprouvable sans
  // monter un composant serveur : c'est ce qui rend AC5 mesuré et non raisonné.
  if (
    estUneDestinationExplicite(demandee) ||
    !doitPoserLaQuestionDIntention(user?.preferences?.entry_intent, profils.ok ? profils.data.data : [])
  ) {
    redirect(apres);
  }

  return (
    <OnboardingShell
      title={t('pageTitle', { name: prenom })}
      subtitle={t('pageSubtitle')}
      note={t('note')}
    >
      <QuestionDIntention apres={apres} />
    </OnboardingShell>
  );
}
