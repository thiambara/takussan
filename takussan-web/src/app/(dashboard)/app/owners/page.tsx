import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchOwners } from '@/lib/queries/owners';
import { OwnersList } from '@/components/owners/OwnersList';
import { isAdmin } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.owners');
  return { title: t('metaTitle') };
}
export const dynamic = 'force-dynamic';

/**
 * TCK-256 — owners listing page for the agency.
 *
 * Réservé aux agences `standard` (`docs/features.md` §1.12). Pour une agence
 * `individual`, le user est le seul propriétaire par construction — pas de
 * gestion d'autres propriétaires. La page redirige donc vers `/app`.
 *
 * TCK-284 — la défense en profondeur porte bien sur l'appel que fait CETTE
 * page. Le docblock annonçait `OwnerProfilePolicy@invite` : c'était vrai de
 * l'invitation et faux de la lecture, qui est le seul appel d'ici. La lecture
 * (`GET /api/owners`) rendait 200 à un `agency_admin` d'agence `individual`
 * armé de son propre jeton. Elle rend désormais 403
 * (`OwnerProfileController::index` → `AgencyKindGuard`).
 * *Une garde citée n'est pas une garde posée.*
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
    resolveAgencyOrNull(token, agencyId, 'owners', 'decision'),
    fetchOwners(token, { agencyId }),
  ]);

  // `null` ici ne peut plus être une panne passagère — `resolveAgencyOrNull(..., 'decision')` les
  // a déjà renvoyées vers `/verification-indisponible`. Il ne reste que 401/403/404 : l'API a
  // répondu que cette agence n'est pas lisible par cet utilisateur. On refuse, comme ailleurs.
  if (!agency) redirect('/app');

  if (agency.kind !== 'standard') redirect('/app');

  const canInvite =
    user.roles.includes('agency_admin') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');

  return (
    <OwnersList agencyId={agencyId} canInvite={canInvite} initialData={owners} />
  );
}
