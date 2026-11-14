import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { FicheDuBailleur } from '@/components/owners/fiche/FicheDuBailleur';
import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { assertCanReachOwnerAccount } from '@/lib/auth/guards';
import { exigerRessource, idDeDetail } from '@/lib/detail/ressource-de-detail';
import { estMois, moisCourant } from '@/lib/finances/mois';
import { ouvreLaFicheDuBailleur } from '@/lib/owners/fiche-accessible';
import { lireBailleurDuRendu } from '@/lib/owners/fiche-du-rendu';
import { fetchDashboardProperties } from '@/lib/queries/properties-server';
import { getToken } from '@/lib/session';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  // TCK-2837 — le refus de rôle du layout, AVANT la sonde, dans le même ordre : un agent refusé garde
  // le titre de l'introuvable, sans lire l'API (`getMeAction` est mémoïsé, aucun /api/auth/me de plus).
  assertCanReachOwnerAccount((await getMeAction()).roles);
  // TCK-2831 — la sonde du layout (mémoïsée) : une fiche absente garde le titre de l'introuvable.
  await exigerRessource('owners', (await params).id);
  const t = await getTranslations('dashboard.pages.ownerDetail');
  return { title: t('metaTitle') };
}

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * TCK-2641 — la fiche d'un bailleur (`/app/owners/[id]`).
 *
 * Le refus (la fiche est celle de l'admin de l'agence, décision 3a) et l'introuvable (404 de l'API)
 * sont décidés par le `layout.tsx` de ce segment, seul endroit où ils rendent 404 (TCK-442). Il ne
 * reste ici que du NARROWING de type : aucun terminateur dans le RENDU, sous le `loading.tsx` de ce
 * segment (`etats-de-route.test.ts`). Le `generateMetadata` rappelle les deux décisions du layout,
 * pour le seul titre de l'onglet (TCK-2831, TCK-2837) : le statut reste celui du layout.
 *
 * `?period=YYYY-MM` choisit le mois du relevé ; absent, mal formé ou à venir, c'est le mois en cours
 * — lu sans `period`, comme le layout, pour partager sa lecture.
 */
export default async function Page({ params, searchParams }: { readonly params: Params; readonly searchParams?: SearchParams }) {
  const token = await getToken();
  if (!token) return null;
  const { agency_id: agencyId, roles } = await getMeAction();
  // TCK-2837 — Next lance ce rendu EN PARALLÈLE du layout qui refuse : sans ce narrowing, l'agent refusé
  // lisait encore la fiche (403 de l'API). Le 404 reste celui du layout ; ici, rien n'est plus lu.
  if (!ouvreLaFicheDuBailleur(roles)) return null;
  const id = idDeDetail((await params).id);
  if (!agencyId || id === null) return null;

  const courant = moisCourant();
  const demande = (await searchParams)?.period;
  const period = typeof demande === 'string' && estMois(demande) && demande < courant ? demande : courant;

  // Le mois en cours se lit SANS `period`, comme la sonde du layout : `cache()` partage la promesse.
  const owner = (await (period === courant ? lireBailleurDuRendu(token, id) : lireBailleurDuRendu(token, id, period))).data;

  const [capacites, biens] = await Promise.all([
    capacitesDuProfilActif(),
    owner.user_id !== null
      ? fetchDashboardProperties(token, { filters: { user_id: String(owner.user_id) }, inclusions: ['occupancy'], perPage: 6, sort: 'retard' })
          .then((r) => r.data)
          .catch(() => [])
      : Promise.resolve([]),
  ]);
  const peut = (capacite: string) => (capacites ?? []).includes(capacite);

  return (
    <FicheDuBailleur
      owner={owner}
      period={period}
      moisCourant={courant}
      biens={biens}
      agencyId={agencyId}
      droits={{
        plafond: peut('owners.update'),
        reversement: peut('payouts.create'),
        suspension: peut('team.suspend'),
        // TCK-2753 — `OwnerProfilePolicy::depart` : l'admin actif de l'agence — celui que le layout laisse passer.
        depart: true,
        // `OwnerProfilePolicy::viewSensitive` : l'admin actif de l'agence — celui que le layout laisse passer.
        sensible: true,
      }}
    />
  );
}
