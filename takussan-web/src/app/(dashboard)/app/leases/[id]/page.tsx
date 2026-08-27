import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getMeAction } from '@/app/actions/auth';
import { apiRequest } from '@/lib/api';
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

  // Resolve the lease reference best-effort. A 401/404 here just means we
  // fall back to the generic title — the actual page rendering owns the
  // hard error path.
  try {
    const token = await getToken();
    if (!token) return { title: t('metaTitleWithId', { id: leaseId }) };
    const res = await apiRequest<{ data: { reference_number?: string | null } }>(
      `/api/leases/${leaseId}?fields[leases]=id,reference_number`,
      { token },
    );
    const ref = res.data?.reference_number;
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
  await getMeAction();
  const { id } = await params;
  const leaseId = Number(id);

  // L'identifiant de l'URL est illisible : aucun bail ne porte ce numéro. C'est un INTROUVABLE.
  // L'écran d'avant était un `ErrorState` — la forme de la PANNE — avec un commentaire expliquant
  // qu'il n'y avait délibérément pas de bouton « réessayer ». Le commentaire disait la bonne
  // chose ; le composant disait l'autre. `notFound()` rend le seul écran qui n'en propose pas.
  if (!Number.isFinite(leaseId) || leaseId <= 0) notFound();

  return <LeaseDetail leaseId={leaseId} />;
}
