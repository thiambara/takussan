import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { getSpAgenciesAction } from '@/app/actions/service-provider-onboarding';
import { ServiceProviderMultiAgencyWelcome } from '@/components/onboarding/ServiceProviderMultiAgencyWelcome';
import { ServiceProviderOnboardingWizard } from '@/components/onboarding/ServiceProviderOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { getToken } from '@/lib/session';
import { profilAReprendre } from '@/lib/onboarding-reprise';

/**
 * TCK-261 / TCK-262 — Post-acceptance landing page for an invited Service
 * Provider.
 *
 * Two flows:
 *  1. **Nouveau SP** : profile en `draft` → wizard 4 étapes (TCK-261).
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

  if (isExistingSp && collabs.length > 0) {
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

  return (
    <OnboardingShell title={t('pageTitle')} subtitle={t('pageSubtitle')}>
      <ServiceProviderOnboardingWizard
        spProfileId={sp.numeric_id}
        fromMaintenanceRequestId={null}
      />
    </OnboardingShell>
  );
}
