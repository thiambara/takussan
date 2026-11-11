import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isOwner, isSuperAdmin } from '@/lib/roles';
import { VisitsList } from '@/components/visits/VisitsList';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { PlanifierUneVisite } from '@/components/visits/PlanifierUneVisite';
import { VisitesParLeTemps } from '@/components/visits/par-le-temps/VisitesParLeTemps';

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
  // À clore, Plus tard ; les onglets de statut restent sous « Par statut » / « Toutes »). Le client
  // garde ses onglets de statut (sa vue « Mes visites » est un lot à part du ticket).
  if (isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles)) {
    return <VisitesParLeTemps titre={t('title')} />;
  }

  return (
    <div className="space-y-6">
      {/* TCK-2586 — la feuille « Planifier une visite » s'ouvre aussi depuis les Visites (personnel seul). */}
      <PageHeader title={t('title')} description={t('subtitle')} actions={<PlanifierUneVisite />} />
      <VisitsList />
    </div>
  );
}
