/**
 * TCK-255 — Host individual onboarding page.
 *
 * Onboards a user into their own agency. Anonymous users bounce to login.
 * Already-onboarded users (anyone with an `agency_admin` role or an `agent`
 * profile attached to an agency) skip the wizard entirely and land on the
 * property-creation flow — re-running the wizard would create a duplicate
 * agency, which is never what the user wants.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMyProfilesAction } from '@/app/actions/profiles';
import { HostIndividualWizard } from '@/components/onboarding/HostIndividualWizard';
import { getToken } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Publier mon premier bien' };

export default async function HostOnboardingPage() {
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fhost');
  }

  // Skip the wizard for anyone who already holds an agency-scoped profile.
  // We rely on the profile listing rather than the legacy `user.agency_id`
  // accessor (returns null for multi-profile users, TCK-142) and we cover
  // `owner` as well as `agent` — a freshly-onboarded host carries an
  // OwnerProfile listed as `type: 'owner'`, which previously slipped past
  // the gate and let the user re-run the wizard, duplicating their agency.
  const profilesRes = await getMyProfilesAction();
  const hasAgencyProfile =
    profilesRes.ok &&
    profilesRes.data.data.some(
      (p) =>
        (p.type === 'owner' || p.type === 'agent') &&
        typeof p.agency_id === 'number',
    );

  if (hasAgencyProfile) {
    redirect('/app/properties/new');
  }

  return (
    <main className="min-h-[80vh] bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Publier votre premier bien
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Quelques étapes pour créer votre espace et vérifier votre numéro —
            vous serez ensuite redirigé vers le formulaire de mise en ligne.
          </p>
        </header>

        <HostIndividualWizard />
      </div>
    </main>
  );
}
