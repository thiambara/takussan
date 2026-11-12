import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isOwner, isSuperAdmin } from '@/lib/roles';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { getTranslations } from 'next-intl/server';
import { VisitesParLeTemps } from '@/components/visits/par-le-temps/VisitesParLeTemps';
import { MesVisites } from '@/components/visits/client/MesVisites';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.visits');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.visits');
  const user = await getMeAction();

  // TCK-115: super_admin without agency_id gets 403 from GET /api/visits
  if (isSuperAdmin(user.roles) && !user.agency_id) {
    return <NoAgencyState title={t('title')} />;
  }

  // TCK-2587 — le personnel et le bailleur lisent les visites PAR LE TEMPS (Aujourd'hui, À confirmer,
  // À clore, Plus tard ; les onglets de statut restent sous « Par statut » / « Toutes »).
  if (isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles)) {
    return <VisitesParLeTemps titre={t('title')} />;
  }

  // TCK-2587 (lot C) — le client lit « Mes visites » : la prochaine visite, l'avis à donner, les
  // demandes en attente, les passées. Il ouvrait sur l'onglet « Demandées 0 » (AC6).
  const tClient = await getTranslations('visits.client');
  return <MesVisites titre={tClient('titre')} />;
}
