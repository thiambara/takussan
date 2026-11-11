import type { Metadata } from 'next';


import { CustomerForm } from '@/components/customer-form';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';
import { idDeDetail } from '@/lib/detail/ressource-de-detail';
import { getToken } from '@/lib/session';
import { ficheDuVisiteur, type FicheDuVisiteur } from '@/lib/visites/fiche-du-visiteur';
import type { ApiResponse } from '@/types/api';
import type { PropertyVisit } from '@/types/visit';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.customerNew');
  return { title: t('metaTitle') };
}

/**
 * TCK-042 — ajout d'un client CRM.
 */

export const dynamic = 'force-dynamic';

/**
 * TCK-2581 — `?visite=<id>` : la fiche d'un visiteur qui n'en avait pas, préremplie depuis sa visite,
 * RELUE ICI avec le jeton du lecteur. L'URL ne porte que l'identifiant : un nom et un numéro de
 * téléphone y partiraient dans l'historique, les journaux et l'en-tête `Referer`. L'API juge ce que
 * le lecteur voit (`visitor_display`, au seul personnel de l'agence du bien) ; une visite illisible
 * ne préremplit rien, sans erreur — le formulaire reste celui d'une fiche vierge.
 */
async function preremplissage(
  brut: string | string[] | undefined,
): Promise<{ readonly initial?: FicheDuVisiteur; readonly visiteDOrigine?: number }> {
  const id = idDeDetail((Array.isArray(brut) ? brut[0] : brut) ?? '');
  if (id === null) return {};
  const token = await getToken();
  if (!token) return {};
  try {
    const { data } = await apiRequest<ApiResponse<PropertyVisit>>(cheminApi`/api/property-visits/${id}`, { token });
    // TCK-2716 — la fiche naît rattachée à sa visite, seulement quand l'API dit que ce lecteur le peut.
    return data.abilities?.create_customer === true ? { initial: ficheDuVisiteur(data), visiteDOrigine: data.id } : {};
  } catch {
    return {};
  }
}

export default async function Page({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> } = {}) {
  const q = (await searchParams) ?? {};
  const { initial, visiteDOrigine } = await preremplissage(q.visite);
  const t = await getTranslations('dashboard.pages.customerNew');
  // TCK-426 — la garde de rôle est REMONTÉE dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la route interdite.

  return (
    // `max-w-3xl` : sur 1366, des champs de 500 px chacun étiraient la saisie d'un nom sur toute
    // la largeur de l'écran.
    <div className="max-w-3xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CustomerForm mode="create" initial={initial} visiteDOrigine={visiteDOrigine} />
    </div>
  );
}
