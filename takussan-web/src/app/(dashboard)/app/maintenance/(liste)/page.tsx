import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { MaintenanceList } from '@/components/maintenance/MaintenanceList';
import { InterventionsDeLAgence } from '@/components/maintenance/files/InterventionsDeLAgence';
import { MesDemandesDuLocataire } from '@/components/maintenance/acteurs/MesDemandesDuLocataire';
import { InterventionsDuBailleur } from '@/components/maintenance/acteurs/InterventionsDuBailleur';
import { InterventionsDuPrestataire } from '@/components/maintenance/acteurs/InterventionsDuPrestataire';
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
  readonly searchParams: Promise<{ status?: string | string[]; factures?: string | string[] }>;
}

export default async function Page({ searchParams }: PageProps) {
  const t = await getTranslations('dashboard.pages.maintenance');
  const user = await getMeAction();
  // TCK-2653 — le personnel de l'agence ouvre les files d'attente (en-tête, filtres et « Signaler
  // une intervention » dans la vue) ; le locataire, le bailleur et le prestataire ont leur vue
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
  const parametres = await searchParams;
  const toutVoir = parametres.status !== undefined;
  if (persona === 'locataire' && !toutVoir) {
    return (
      <div className="space-y-6">
        <MesDemandesDuLocataire />
        {isServiceProvider(user.roles) ? <ServiceProviderBillsTable mode="provider" /> : null}
      </div>
    );
  }
  // TCK-2654, lot 3 — le bailleur ouvre le devis qui attend son accord, puis ce qui est en cours sur
  // ses biens ; « Tout voir » (`?status=`) garde la liste complète.
  if (persona === 'bailleur' && !toutVoir) {
    return (
      <div className="space-y-6">
        <InterventionsDuBailleur />
        {isServiceProvider(user.roles) ? <ServiceProviderBillsTable mode="provider" /> : null}
      </div>
    );
  }
  // TCK-2654, lot 4 — le prestataire ouvre « Mes interventions » (à accepter, sa semaine, ses
  // factures en cartes) ; `?factures=toutes` (« Toutes ») ouvre le registre complet de ses factures.
  if (persona === 'prestataire' && !toutVoir) {
    if (parametres.factures === 'toutes') {
      const tPrestataire = await getTranslations('maintenance.prestataire.factures');
      return (
        <div className="space-y-6">
          <PageHeader title={tPrestataire('registre')} />
          <ServiceProviderBillsTable mode="provider" titreMasque />
        </div>
      );
    }
    return <InterventionsDuPrestataire />;
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
