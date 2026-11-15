import { getTranslations } from 'next-intl/server';
import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';
import { CadreDeLaFiche } from '@/components/admin-agency/fiche/CadreDeLaFiche';
import { ReglagesDeBail } from '@/components/admin-agency/reglages-de-bail/ReglagesDeBail';
import { NoAgencyState } from '@/components/shared/NoAgencyState';
import { accesAdmin, capacitesDuProfilActif, garderPageAdmin } from '@/lib/access/pages-admin-server';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { lienDuBail, retourAuBailDepuis } from '@/lib/agence/retour-au-bail';
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
 * délai de grâce, indemnité de départ, plafond de révision).
 *
 * TCK-2921 (ADR-0111) — la page s'ouvre au personnel de l'agence, agent compris (`PAGES_ADMIN`,
 * `personnel`). L'état « lecture seule » se décide dans `ReglagesDeBail` sur `can_edit` de l'API,
 * SEUL — jamais sur le rôle. « Modifier », dans l'encart du nouveau bail, y mène dans le MÊME onglet,
 * avec `?depuis=bail` et les identifiants du bail (`lib/agence/retour-au-bail`) : un encart ramène
 * au bail, dont la saisie est gardée en brouillon (TCK-2912).
 *
 * Qui ne peut pas ouvrir « Mon agence » (l'agent) lit la section sans la navigation des autres
 * sections : chacune mènerait à `/app/agency`, qui le refuse — une porte peinte sur un mur.
 */
export default async function Page(props?: {
  readonly searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  // La fiche publique ne se propose qu'à qui l'écrit ; elle ne décide plus de l'accès à cette page.
  const vitrine = peutEcrireLaVitrine(await capacitesDuProfilActif(), agence, user.id);
  const ficheOuverte = (await accesAdmin(user)).chemins.includes('/app/agency');
  const retour = retourAuBailDepuis(props?.searchParams ? await props.searchParams : null);

  return (
    <CadreDeLaFiche
      agency={agence}
      vitrine={vitrine}
      origineSite={origineSite()}
      section="bail"
      titre={t('titre')}
      texte={t('description')}
      navigation={ficheOuverte}
      repli={retour ? lienDuBail(retour) : ficheOuverte ? '/app/agency' : '/app'}
    >
      <ReglagesDeBail retour={retour} />
    </CadreDeLaFiche>
  );
}
