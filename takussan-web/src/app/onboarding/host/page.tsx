/**
 * TCK-255 — Host individual onboarding page.
 *
 * Replaces the TCK-254 stub with the real 5-step wizard. The universal
 * "Publier" CTA routes here whenever an authenticated user has neither an
 * `agency_admin` nor an `agent` profile. Anonymous users are bounced to
 * `/auth/login` with a `redirect=/onboarding/host` so they come back here
 * post-auth.
 */

import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { HostIndividualWizard } from '@/components/onboarding/HostIndividualWizard';
import { getToken } from '@/lib/session';

export const metadata: Metadata = { title: 'Publier mon premier bien' };

export default async function HostOnboardingPage() {
  const token = await getToken();
  if (!token) {
    redirect('/auth/login?redirect=%2Fonboarding%2Fhost');
  }

  return (
    <main className="min-h-[80vh] bg-background px-4 py-12 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 text-center">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Publier votre premier bien
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Cinq étapes guidées pour créer votre espace, vérifier votre numéro
            et déposer votre premier bien en brouillon.
          </p>
        </header>

        <HostIndividualWizard />
      </div>
    </main>
  );
}
