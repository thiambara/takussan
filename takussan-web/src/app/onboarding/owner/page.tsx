import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { OwnerOnboardingWizard } from '@/components/onboarding/OwnerOnboardingWizard';
import { getToken } from '@/lib/session';

/**
 * TCK-257 — Post-acceptance landing page for an invited Owner.
 *
 * Mirror of the SP onboarding page (TCK-261) :
 *  - Auth gate redirects to login with `?redirect=/onboarding/owner`.
 *  - Pulls the user's profiles, picks the first owner profile.
 *  - Falls back to `/app` when no owner profile is attached.
 *
 * The wizard itself (status flip, KYC, OTP, recap) lives in
 * `<OwnerOnboardingWizard>`.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Onboarding propriétaire',
};

export default async function OwnerOnboardingPage() {
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fowner');
  }

  const profilesRes = await getMyProfilesAction();
  if (!profilesRes.ok) {
    redirect('/app');
  }

  const owner = profilesRes.data.data.find((profile) => profile.type === 'owner');
  if (!owner) {
    redirect('/app');
  }

  return (
    <main className="min-h-[80vh] bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Bienvenue dans votre espace propriétaire
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Quatre étapes guidées pour vérifier votre identité, transmettre vos
            pièces et découvrir vos biens.
          </p>
        </header>

        <OwnerOnboardingWizard ownerProfileId={owner.numeric_id} />
      </div>
    </main>
  );
}
