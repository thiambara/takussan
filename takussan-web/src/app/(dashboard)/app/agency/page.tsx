import { getTranslations } from 'next-intl/server';
import { Building2 } from 'lucide-react';

import { getMeAction } from '@/app/actions/auth';
import { fetchAgencyAction } from '@/app/actions/admin-agency';
import { capacitesDuProfilActif, garderPageAdmin } from '@/lib/access/pages-admin-server';
import { peutEcrireLaVitrine } from '@/lib/vitrine-agence';
import { AgencyConfigForm } from '@/components/admin-agency/AgencyConfigForm';
import { RegenerateWatermarksCard } from '@/components/admin-agency/RegenerateWatermarksCard';
import { AgencyPublicProfileCard } from '@/components/admin-agency/AgencyPublicProfileCard';
import { EmptyState, ErrorState } from '@/components/feedback';
import { PageHeader } from '@/components/console';
import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.agencyConfig');
  return { title: t('title') };
}

/**
 * Admin — agency configuration page (TCK-064).
 *
 * Loads the current user's agency via SSR so the form is pre-filled with
 * no flash of empty inputs. Users without an attached agency are bounced
 * to the admin root (the layout already gates by admin-level role).
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

  return (
    <div className="space-y-6">
      <PageHeader title={tPage('title')} description={tPage('subtitle')} />
      <AgencyConfigForm agency={result.data} />
      {/* TCK-2524 — la vitrine de la fiche publique : son propre formulaire, HORS de celui du dessus
          (même raison que la carte des filigranes), et seulement pour qui configure l'agence. */}
      {peutEcrireLaVitrine(await capacitesDuProfilActif(), result.data, user.id) ? (
        <AgencyPublicProfileCard agency={result.data} />
      ) : null}
      {/* HORS du `<form>` d'AgencyConfigForm, délibérément : un bouton posé dedans partage sa
          soumission, et un `<form>` imbriqué n'est pas du HTML valide.
          TCK-633 — et seulement si le filigrane est allumé pour la plateforme : éteint (le
          défaut), la carte promettait un filigrane qu'aucune photo ne recevrait. */}
      {result.data.watermark_available === true ? <RegenerateWatermarksCard agencyId={result.data.id} /> : null}
    </div>
  );
}
