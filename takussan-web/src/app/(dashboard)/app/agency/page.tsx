import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { capacitesDuProfilActif, garderPageAdmin } from '@/lib/access/pages-admin-server';
import { peutEcrireLaVitrine } from '@/lib/vitrine-agence';
import { FicheDeLAgence } from '@/components/admin-agency/fiche/FicheDeLAgence';
import { origineSite } from '@/lib/config-publique';
import { EmptyState, ErrorState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.agencyConfig.fiche');
  return { title: t('titre') };
}

/**
 * La fiche de l'agence (TCK-064, refondue par TCK-2670 : sommaire, complétude, une section par écran).
 *
 * L'agence se lit côté serveur : le formulaire s'ouvre rempli, sans champ vide qui clignote. Sans
 * agence : `EmptyState` ; agence illisible : `ErrorState`.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  await garderPageAdmin('/app/agency');
  const tPage = await getTranslations('admin.pages.agencyConfig');
  const user = await getMeAction();
  const t = await getTranslations('agency.config');

  if (!user.agency_id) {
    return (
      <div className="space-y-6">
        <PageHeader title={tPage('title')} description={tPage('noAgency')} />
        <EmptyState
          icon={<Building2 className="size-8" aria-hidden="true" />}
          title={t('no_agency_title')}
          description={t('no_agency_description')}
        />
      </div>
    );
  }

  const result = await fetchAgencyAction(user.agency_id);
  if (!result.ok || !result.data) {
    return (
      <div className="space-y-6">
        <PageHeader title={tPage('title')} description={tPage('loadError')} />
        {/* Pas d'`onRetry` : server component, aucun gestionnaire d'événement possible ici. */}
        <ErrorState message={result.ok ? t('not_found') : result.message} />
      </div>
    );
  }

  // TCK-2670 — la fiche entière, ses sections et son unique formulaire. La page ne lit PAS `?section=` :
  // la section se change dans le navigateur (`history.pushState`), sans relire l'agence — une relecture
  // ratée remplacerait le formulaire par l'état d'erreur et perdrait la saisie.
  return (
    <FicheDeLAgence
      agency={result.data}
      // TCK-2524 — la vitrine ne se propose qu'à qui configure l'agence.
      vitrine={peutEcrireLaVitrine(await capacitesDuProfilActif(), result.data, user.id)}
      // TCK-633 — « Regénérer les filigranes » seulement si le filigrane est allumé pour la plateforme.
      filigranes={result.data.watermark_available === true}
      origineSite={origineSite()}
    />
  );
}
