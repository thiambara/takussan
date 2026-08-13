import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getActiveProfileId, getToken } from '@/lib/session';
import { fetchAgency } from '@/lib/queries/agencies';
import { fetchOwners } from '@/lib/queries/owners';
import { OwnersList } from '@/components/owners/OwnersList';
import { isAdmin } from '@/lib/roles';

export const metadata: Metadata = { title: 'Propriétaires' };
export const dynamic = 'force-dynamic';

/**
 * TCK-256 — owners listing page for the agency.
 *
 * Réservé aux agences `standard`. Pour une agence `individual`, le user
 * est le seul propriétaire par construction — pas de gestion d'autres
 * propriétaires. La page redirige donc vers `/app` ; la policy backend
 * (`OwnerProfilePolicy@invite`) renvoie 403 en defense in depth.
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
    fetchAgency(token, agencyId, await getActiveProfileId()),
    fetchOwners(token, { agencyId }),
  ]);

  if (agency.kind !== 'standard') redirect('/app');

  const canInvite =
    user.roles.includes('agency_admin') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');

  return (
    <OwnersList agencyId={agencyId} canInvite={canInvite} initialData={owners} />
  );
}
