import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchAgency } from '@/lib/queries/agencies';
import { fetchOwners } from '@/lib/queries/owners';
import { OwnersList } from '@/components/owners/OwnersList';
import { isAdmin } from '@/lib/roles';

export const metadata: Metadata = { title: 'Propriétaires' };
export const dynamic = 'force-dynamic';

/**
 * TCK-256 — owners listing page for the agency.
 *
 * The "Add owner" CTA is hidden when the active agency is not
 * `standard` (typology gate) or when the current user is not at least
 * `agency_admin` / `super_admin` / `admin`. The backend policy
 * (`OwnerProfilePolicy@invite`) re-checks both rules so an evaded UI
 * gate still yields a 403.
 *
 * Agents with the `invite_owner` permission delegated will see a
 * "permission denied" toast if they invent a payload — the next iteration
 * (TCK-260+) can pull permissions client-side to hide the CTA pre-flight.
 */
export default async function Page() {
  const user = await getMeAction();
  const token = await getToken();
  if (!token) redirect('/auth/login?redirect=/app/owners');

  // Owners area is agent-or-above only.
  const isAgencySide =
    user.roles.includes('agency_admin') ||
    user.roles.includes('agent') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');
  if (!isAgencySide) redirect('/app');

  const agencyId = user.agency_id;
  if (!agencyId) {
    // Super-admin without an agency context can still navigate other
    // areas; the owners page is per-agency so we send them back.
    redirect('/app');
  }

  const [agency, owners] = await Promise.all([
    fetchAgency(token, agencyId),
    fetchOwners(token, { agencyId }),
  ]);

  // TCK-256 — UI visibility gate. The backend re-checks both conditions.
  const canInvite =
    agency.kind === 'standard' &&
    (user.roles.includes('agency_admin') ||
      isAdmin(user.roles) ||
      user.roles.includes('super_admin'));

  return (
    <OwnersList agencyId={agencyId} canInvite={canInvite} initialData={owners} />
  );
}
