import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { getSpAgenciesAction } from '@/app/actions/service-provider-onboarding';
import { ServiceProviderMultiAgencyWelcome } from '@/components/onboarding/ServiceProviderMultiAgencyWelcome';
import { ServiceProviderOnboardingWizard } from '@/components/onboarding/ServiceProviderOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { profilAReprendre } from '@/lib/onboarding-reprise';
import type { MesPiecesResponse } from '@/lib/pieces/pieces';
import { fetchInterventionDOrigine, fetchReglagesDuPrestataire, fetchSpAgencies } from '@/lib/service-provider-onboarding';
import { MAINTENANCE_CATEGORIES } from '@/types/maintenance';

/**
 * TCK-261 / TCK-262 — Post-acceptance landing page for an invited Service
 * Provider.
 *
 * Two flows:
 *  1. **Nouveau SP** (déjà `active` : l'acceptation l'active, cf. plus bas) → assistant à deux écrans (TCK-261, refait par TCK-2613 : le numéro,
 *     puis l'intervention jointe à l'invitation et le profil à compléter).
 *  2. **SP existant rattaché à une nouvelle agence** (TCK-262) : profile
 *     déjà `active` avec ≥1 collab active → on saute le wizard et on
 *     affiche un panneau "Bienvenue chez {agence}" avec CTA vers la
 *     maintenance request d'origine si présente.
 *
 * Le flag `existing_sp_other_agency` stocké sur l'invitation par
 * ServiceProviderInvitationService::invite signale ce cas en amont — la
 * page le double-vérifie ici en lisant le statut du SP profile (le seul
 * indicateur fiable côté front sans round-trip supplémentaire).
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('serviceProviders.onboarding');
  return { title: t('metaTitle') };
}

export default async function ServiceProviderOnboardingPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ sp?: string | string[] }>;
}) {
  const t = await getTranslations('serviceProviders.onboarding');
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fservice-provider');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  // TCK-589 — `?sp=` (lien de reprise), sinon le premier profil à compléter. À défaut, le profil
  // actif reste candidat pour le seul panneau multi-agences de TCK-262 ci-dessous.
  const profils = profilesRes.data.data;
  const aReprendre = profilAReprendre(profils, 'service_provider', (await searchParams).sp);
  const sp =
    aReprendre ??
    profils.find((profile) => profile.type === 'service_provider' && profile.status === 'active');
  if (!sp) {
    redirect('/app');
  }

  // TCK-262 — detect "SP existant qui ajoute une agence" : profile
  // status active + collabs déjà existantes. Pas de wizard à refaire.
  const isExistingSp = sp.status === 'active';
  const agenciesRes = isExistingSp ? await getSpAgenciesAction() : null;
  const collabs = agenciesRes?.ok ? agenciesRes.data.data : [];
  // TCK-2613 — ⚠ l'acceptation de l'invitation passe DÉJÀ le profil à `active` et sa collaboration aussi
  // (`InvitationService`, P208.02) : un invité tout neuf arrive ici, par `?sp=` (`destinationDInvitation`), actif
  // avec la seule collaboration de son invitation. Il voyait le panneau multi-agences, jamais l'assistant — ni son
  // numéro, ni la fin d'onboarding qui lui assigne la demande jointe. Le panneau reste au prestataire qui
  // travaillait DÉJÀ avec une autre agence (plus d'une collaboration), ou qui arrive sans lien de reprise.
  const dejaPrestataireAilleurs = collabs.length > 1;

  if (isExistingSp && collabs.length > 0 && (!aReprendre || dejaPrestataireAilleurs)) {
    return (
      <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')}>
        <ServiceProviderMultiAgencyWelcome
          collaborations={collabs}
          spProfileId={sp.numeric_id}
        />
      </OnboardingShell>
    );
  }

  // Un profil actif qui n'a été retenu que pour ce panneau ne remonte pas l'assistant : c'est le
  // défaut même de TCK-589, le profil déjà finalisé rouvert.
  if (!aReprendre) {
    redirect('/app');
  }

  // TCK-2613 — ce que l'écran 2 montre, lu ici : l'intervention jointe (projection minimale, titulaire seul), les
  // réglages du profil et ses pièces (`X-Profile-Id`) pour « Complétez votre profil », l'agence qui invite. Une
  // lecture en échec n'empêche pas d'entrer : l'écran montre ce qu'il a.
  const [intervention, reglages, pieces, agences] = await Promise.all([
    fetchInterventionDOrigine(token, sp.numeric_id).catch(() => null),
    fetchReglagesDuPrestataire(token, sp.numeric_id).catch(() => null),
    apiRequest<MesPiecesResponse>('/api/me/pieces', {
      token,
      headers: { 'X-Profile-Id': `service_provider:${sp.numeric_id}` },
    }).catch(() => null),
    agenciesRes?.ok ? Promise.resolve(agenciesRes.data) : fetchSpAgencies(token).catch(() => null),
  ]);
  // L'agence qui invite : la collaboration la plus récente encore ouverte de CE profil (la liste est celle du
  // premier profil prestataire du compte : un autre profil n'y prête pas son agence).
  const collaborations =
    agences && agences.meta?.service_provider_profile_id === sp.numeric_id
      ? agences.data.filter((c) => c.status !== 'ended').sort((a, b) => b.collaboration_id - a.collaboration_id)
      : [];
  const agence = collaborations[0]?.agency.name ?? null;
  // Le libellé de la catégorie se traduit ICI : l'espace `maintenance` entier n'a pas à suivre l'onboarding
  // (`src/i18n/namespaces.json`) pour un seul mot. Un code inconnu ne s'affiche pas.
  const code = intervention?.data?.category ?? null;
  const tCategorie = await getTranslations('maintenance.category');
  const categorie = code !== null && (MAINTENANCE_CATEGORIES as readonly string[]).includes(code) ? tCategorie(code) : null;

  // TCK-2613 — deux écrans dans la coque d'entrée : chaque écran porte son titre, la barre dit l'agence et l'étape.
  return (
    <OnboardingShell brouillon sortie="quitter" largeur="assistant">
      <ServiceProviderOnboardingWizard
        spProfileId={sp.numeric_id}
        agence={agence}
        intervention={intervention?.data ?? null}
        categorie={categorie}
        reglages={reglages?.data ?? null}
        pieces={pieces?.data ?? null}
      />
    </OnboardingShell>
  );
}
