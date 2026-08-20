import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchServiceProviders } from '@/lib/queries/service-providers';
import { ServiceProvidersList } from '@/components/service-providers/ServiceProvidersList';
import { isAdmin } from '@/lib/roles';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.providers');
  return { title: t('metaTitle') };
}
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
    resolveAgencyOrNull(token, agencyId, 'maintenance/providers'),
    fetchServiceProviders(token, { agencyId }),
  ]);

  // `affichage`, et AUCUNE redirection sur `null` — parce qu'ici `kind` ne garde rien.
  //
  // La ligne d'à côté le dit : `individual` est explicitement autorisée. L'agence ne sert qu'à
  // calculer `canInvite`, un détail d'interface que le backend re-vérifie de toute façon. En
  // `decision`, un 429 envoyait l'utilisateur sur « Vos accès n'ont pas pu être vérifiés » pour
  // une page à laquelle il a droit, et un 404 le renvoyait sur `/app`. On lui annonçait un échec
  // d'autorisation quand c'est un appel d'affichage qui avait échoué.
  //
  // Ne pas savoir dégrade donc `canInvite` à `false` — fail-closed sur le bouton, pas sur la page.

  // TCK-260 — UI visibility gate. Le backend re-vérifie les deux conditions.
  // `individual` est explicitement autorisé (cf. ticket).
  const canInvite =
    (agency?.kind === 'standard' || agency?.kind === 'individual') &&
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
