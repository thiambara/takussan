import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchAgency } from '@/lib/queries/agencies';
import { fetchTeam } from '@/lib/queries/team';
import { TeamMembersList } from '@/components/team/TeamMembersList';
import { isAdmin } from '@/lib/roles';

export const metadata: Metadata = { title: 'Équipe' };
export const dynamic = 'force-dynamic';

/**
 * TCK-258 — team management page for the agency.
 *
 * The "Inviter un agent" CTA is hidden when the active agency is not
 * `standard` (typology gate) or when the current user is not at least
 * `agency_admin` / `super_admin`. The backend policy
 * (`AgentProfilePolicy@invite`) re-checks both rules so an evaded UI
 * gate still yields a 403.
 */
export default async function Page() {
  const user = await getMeAction();
  const token = await getToken();
  if (!token) redirect('/auth/login?redirect=/app/team');

  // Team area is admin-side only.
  const isAgencyAdmin =
    user.roles.includes('agency_admin') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');
  if (!isAgencyAdmin) redirect('/app');

  const agencyId = user.agency_id;
  if (!agencyId) redirect('/app');

  const [agency, team] = await Promise.all([
    fetchAgency(token, agencyId),
    fetchTeam(token, { agencyId }),
  ]);

  // Standard-only — bounce individual hosts back to dashboard.
  if (agency.kind !== 'standard') redirect('/app');

  // UI visibility gate. The backend re-checks both conditions.
  const canManage =
    agency.kind === 'standard' &&
    (user.roles.includes('agency_admin') ||
      isAdmin(user.roles) ||
      user.roles.includes('super_admin'));

  return (
    <TeamMembersList agencyId={agencyId} canManage={canManage} initialData={team} />
  );
}
