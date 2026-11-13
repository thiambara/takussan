import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { MaintenanceList } from '@/components/maintenance/MaintenanceList';
import { InterventionsDeLAgence } from '@/components/maintenance/files/InterventionsDeLAgence';
import { MesDemandesDuLocataire } from '@/components/maintenance/acteurs/MesDemandesDuLocataire';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { ServiceProviderBillsTable } from '@/components/payments/ServiceProviderBillsTable';
import { profilLieDeLaCoque, resoudrePersona, typeDuProfilActif } from '@/lib/navigation/personas';
import { isAdmin, isAgent, isServiceProvider } from '@/lib/roles';
import { getActiveProfileId } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.maintenance');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly searchParams: Promise<{ status?: string | string[] }>;
}

export default async function Page({ searchParams }: PageProps) {
  const t = await getTranslations('dashboard.pages.maintenance');
  const user = await getMeAction();
  // TCK-2653 — le personnel de l'agence ouvre les files d'attente (en-tête, filtres et « Signaler
  // une intervention » dans la vue) ; le locataire, le bailleur et le prestataire gardent la liste
  // (TCK-2654). Même partage que « Baux » (TCK-2644).
  if (isAgent(user.roles) || isAdmin(user.roles)) {
    return (
      <div className="space-y-6">
        <InterventionsDeLAgence />
        {isServiceProvider(user.roles) ? <ServiceProviderBillsTable mode="provider" /> : null}
      </div>
    );
  }
  // TCK-2654 — le locataire ouvre « mes demandes » (la terminée à confirmer, en cours, terminées) ;
  // `?status=` (« Tout voir ») garde la liste complète, avec sa recherche et ses filtres. Le persona est
  // celui de la coque, comme pour `/app/maintenance/new`.
  const persona = resoudrePersona({
    roles: user.roles,
    typeProfilActif: typeDuProfilActif(profilLieDeLaCoque(await getActiveProfileId(), user)),
  });
  if (persona === 'locataire' && (await searchParams).status === undefined) {
    return (
      <div className="space-y-6">
        <MesDemandesDuLocataire />
        {isServiceProvider(user.roles) ? <ServiceProviderBillsTable mode="provider" /> : null}
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <MaintenanceList />
      {/* TCK-594 (ADR-0039 §8) — le prestataire suit ses factures et leur paiement. */}
      {isServiceProvider(user.roles) ? <ServiceProviderBillsTable mode="provider" /> : null}
    </div>
  );
}
