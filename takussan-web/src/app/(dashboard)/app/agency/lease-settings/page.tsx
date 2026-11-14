import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';
import { CadreDeLaFiche } from '@/components/admin-agency/fiche/CadreDeLaFiche';
import { ReglagesDeBail } from '@/components/admin-agency/reglages-de-bail/ReglagesDeBail';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { capacitesDuProfilActif, garderPageAdmin } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { origineSite } from '@/lib/config-publique';
import { getToken } from '@/lib/session';
import { peutEcrireLaVitrine } from '@/lib/vitrine-agence';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('admin.pages.reglagesDeBail');
  return { title: t('title') };
}

export const dynamic = 'force-dynamic';

/**
 * TCK-2832 — « Réglages de bail », une section-page de la fiche « Mon agence » (maquette
 * `app-agence-reglages-bail`, approche A) : ce que chaque bail neuf reprend (pénalité de retard,
 * délai de grâce, indemnité de départ, plafond de révision). Le lien « Modifier » de l'encart du
 * nouveau bail y mène, dans un nouvel onglet.
 *
 * Montrée à qui configure l'agence, seul (`peutEcrireLaVitrine` : la règle d'`AgencyPolicy::configure`).
 * Les autres reviennent au sommaire : l'API leur refuse la lecture, et l'état « lecture seule » de la
 * maquette n'est pas livré (un agent lit déjà ces valeurs dans l'encart du bail). L'API rejuge tout.
 */
export default async function Page() {
  await garderPageAdmin('/app/agency/lease-settings');
  const t = await getTranslations('agency.reglagesDeBail');
  const user = await getMeAction();

  if (!user.agency_id) {
    return <NoAgencyState title={t('sansAgence')} />;
  }

  const token = await getToken();
  const agence = token ? await resolveAgencyOrNull(token, user.agency_id, 'app/agency/lease-settings') : null;
  if (!agence) {
    return <NoAgencyState title={t('agenceIllisible')} />;
  }

  const peutModifier = peutEcrireLaVitrine(await capacitesDuProfilActif(), agence, user.id);
  if (!peutModifier) redirect('/app/agency');

  return (
    <CadreDeLaFiche
      agency={agence}
      vitrine={peutModifier}
      origineSite={origineSite()}
      section="bail"
      titre={t('titre')}
      texte={t('description')}
    >
      <ReglagesDeBail />
    </CadreDeLaFiche>
  );
}
