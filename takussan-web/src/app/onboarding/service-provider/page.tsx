import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { ServiceProviderOnboardingWizard } from '@/components/onboarding/ServiceProviderOnboardingWizard';
import { getToken } from '@/lib/session';

/**
 * TCK-261 — Post-acceptance landing page for an invited Service Provider.
 *
 * The link in the invitation email funnels here after the user accepts
 * via `/auth/login` or the public accept route. We:
 *  1. Gate auth (redirect to login).
 *  2. Look up the user's SP profile (the acceptance flow attaches user_id).
 *  3. Mount the wizard, passing the originating maintenance request id
 *     when the invitation carried one (TCK-260 metadata).
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
