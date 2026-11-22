import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { accesAdmin } from '@/lib/access/pages-admin-server';
import { apiRequest } from '@/lib/api';
import { exigerRessource } from '@/lib/detail/ressource-de-detail';
import { getToken } from '@/lib/session';
import { LeaseDetail } from '@/components/leases/LeaseDetail';

/**
 * Le titre d'onglet de cette page était écrit EN FRANÇAIS, dans le code, à trois endroits — le
 * nom du contrat suivi du numéro, en gabarit interpolé. Un lecteur anglophone ou wolophone
 * lisait donc du français dans son onglet : violation directe du principe 5 du `CLAUDE.md`
 * (*« le front possède le texte affiché »*) dans un dépôt dont les trois dictionnaires sont
 * complets. Le motif exact n'est pas recopié ici : un AC de TCK-382 le cherche par grep, et un
 * commentaire le ferait échouer sur du code juste.
 *
 * ⚠ `check-i18n.mjs` ne l'avait pas vu, et ne pouvait pas : son contrôle B ne lit ni les gabarits
 * interpolés ni les propriétés d'objet. C'est le PLANCHER que son propre message de sortie
 * annonce. Deux autres titres du même genre vivaient sur `customers/page.tsx` et `visits/[id]`.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const t = await getTranslations('dashboard.pages.leaseDetail');
  const leaseId = Number(id);
  if (!Number.isFinite(leaseId) || leaseId <= 0) {
    return { title: t('metaTitleFallback') };
  }
  // TCK-2831 — la sonde du layout (mémoïsée) : une fiche absente garde le titre de l'introuvable.
  await exigerRessource('leases', id);

  // Resolve the lease reference best-effort. A 401/404 here just means we
  // fall back to the generic title — the actual page rendering owns the
  // hard error path.
  try {
    const token = await getToken();
    if (!token) return { title: t('metaTitleWithId', { id: leaseId }) };
    // TCK-1067 (P60.03) — la LISTE filtrée par id : un `show` rend la ressource de détail entière
    // (bien, locataire, paiements, signatures), et `fields` n'y vaut rien.
    const res = await apiRequest<{ data: { reference_number?: string | null }[] }>(
      `/api/leases?filter[id]=${leaseId}&fields[leases]=id,reference_number&per_page=1`,
      { token },
    );
    const ref = res.data?.[0]?.reference_number;
    return {
      title: ref
        ? t('metaTitleWithReference', { reference: ref })
        : t('metaTitleWithId', { id: leaseId }),
    };
  } catch {
    return { title: t('metaTitleWithId', { id: leaseId }) };
  }
}

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getMeAction();
  const { id } = await params;
  const leaseId = Number(id);
  // TCK-2645 (décision 11) — l'onglet « Historique » au seul lecteur à qui la piste d'audit s'ouvre :
  // la même règle que l'API (`ActivityLogPolicy::viewAny`), lue comme la coque la lit (`accesAdmin`,
  // mémoïsé par rendu) ; aux autres, l'onglet n'existe pas.
  const historique = (await accesAdmin(user)).chemins.includes('/app/agency/audit');

  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

  return <LeaseDetail leaseId={leaseId} historique={historique} />;
}
