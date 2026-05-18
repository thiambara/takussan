import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { getSpAgenciesAction } from '@/app/actions/service-provider-onboarding';
import { ServiceProviderMultiAgencyWelcome } from '@/components/onboarding/ServiceProviderMultiAgencyWelcome';
import { ServiceProviderOnboardingWizard } from '@/components/onboarding/ServiceProviderOnboardingWizard';
import { getToken } from '@/lib/session';

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

export const metadata: Metadata = {
  title: 'Onboarding prestataire',
};

export default async function ServiceProviderOnboardingPage() {
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fservice-provider');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  const sp = profilesRes.data.data.find(
    (profile) => profile.type === 'service_provider',
  );
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
      <main className="min-h-[80vh] bg-background px-4 py-12 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <ServiceProviderMultiAgencyWelcome
            collaborations={collabs}
            spProfileId={sp.numeric_id}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[80vh] bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Bienvenue dans votre espace prestataire
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Quatre étapes guidées pour vérifier votre identité, déclarer vos
            métiers et planifier votre semaine.
          </p>
        </header>

        <ServiceProviderOnboardingWizard
          spProfileId={sp.numeric_id}
          fromMaintenanceRequestId={null}
        />
      </div>
    </main>
  );
}
