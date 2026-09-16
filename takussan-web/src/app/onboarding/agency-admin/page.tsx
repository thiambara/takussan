import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { AgencyAdminOnboardingWizard } from '@/components/onboarding/AgencyAdminOnboardingWizard';
import { OnboardingShell } from '@/components/onboarding/OnboardingShell';
import { isAgencyAdmin } from '@/lib/roles';

/**
 * TCK-270 — Post-activation landing page for a freshly-invited agency_admin.
 *
 * Reachable from the activation email's reset-password redirect (or directly
 * by URL during onboarding outreach). Non-blocking: the user can leave at any
 * time without breaking anything downstream.
 *
 * Auth/role gating mirrors the dashboard: anyone who isn't an agency_admin
 * is bounced to /app where the role-aware shell takes over.
 */
export const dynamic = 'force-dynamic';

export default async function AgencyAdminOnboardingPage() {
  const user = await getMeAction();

  if (!isAgencyAdmin(user.roles) || !user.agency_id) {
    redirect('/app');
  }

  const agencyResult = await fetchAgencyAction(user.agency_id);
  const agencyName =
    agencyResult.ok && agencyResult.data ? agencyResult.data.name : '—';

  // La coque commune donne à cet écran ce qu'il n'avait pas : la marque et une issue vers le
  // site. Sans titre (l'assistant porte le sien, qui change d'étape en étape) et sans pied —
  // rien n'y est enregistré au fil de la saisie, la mention d'autosauvegarde serait fausse.
  return (
    <OnboardingShell note={null}>
      <AgencyAdminOnboardingWizard
        firstName={user.first_name}
        agencyName={agencyName}
      />
    </OnboardingShell>
  );
}
