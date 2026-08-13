import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchServiceProviders } from '@/lib/queries/service-providers';
import { ServiceProvidersList } from '@/components/service-providers/ServiceProvidersList';
import { isAdmin } from '@/lib/roles';

export const metadata: Metadata = { title: 'Carnet prestataires' };
export const dynamic = 'force-dynamic';

/**
 * TCK-260 — page carnet prestataires.
 *
 * Le CTA "Ajouter un prestataire" est visible quand :
 *  - l'agence est `standard` OU `individual` (le carnet est ouvert aux
 *    deux typologies — un host individual a aussi besoin de ses
 *    prestataires) ;
 *  - et l'acteur est `agency_admin` / `super_admin` / `admin` ou un
 *    agent à qui la permission `invite_service_provider` a été
 *    déléguée. La détection de la permission déléguée côté front est
 *    laissée à TCK-262/261 (pour l'instant le toast 403 sert de garde-
 *    fou côté backend).
 */
export default async function Page() {
  const user = await getMeAction();
  const token = await getToken();
  if (!token) redirect('/auth/login?redirect=/app/maintenance/providers');

  const isAgencySide =
    user.roles.includes('agency_admin') ||
    user.roles.includes('agent') ||
    isAdmin(user.roles) ||
    user.roles.includes('super_admin');
  if (!isAgencySide) redirect('/app');

  const agencyId = user.agency_id;
  if (!agencyId) {
    redirect('/app');
  }

  const [agency, providers] = await Promise.all([
    resolveAgencyOrNull(token, agencyId, 'maintenance/providers', 'decision'),
    fetchServiceProviders(token, { agencyId }),
  ]);

  // `null` ici ne peut plus être une panne passagère — `resolveAgencyOrNull(..., 'decision')` les
  // a déjà renvoyées vers `/verification-indisponible`. Il ne reste que 401/403/404 : l'API a
  // répondu que cette agence n'est pas lisible par cet utilisateur. On refuse, comme ailleurs.
  if (!agency) redirect('/app');

  // TCK-260 — UI visibility gate. Le backend re-vérifie les deux conditions.
  // `individual` est explicitement autorisé (cf. ticket).
  const canInvite =
    (agency.kind === 'standard' || agency.kind === 'individual') &&
    (user.roles.includes('agency_admin') ||
      isAdmin(user.roles) ||
      user.roles.includes('super_admin'));

  return (
    <ServiceProvidersList
      agencyId={agencyId}
      canInvite={canInvite}
      initialData={providers}
    />
  );
}
