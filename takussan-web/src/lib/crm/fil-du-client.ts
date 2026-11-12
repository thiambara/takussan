/**
 * TCK-2589 — le fil de la fiche client, sans formulation : le filtre de l'URL et ce que chaque entrée
 * dit. Pur, sans directive ; `components/customer-dashboard/fiche/FilDuClient.tsx` le formule.
 */
import type { EntreeDuFil, TypeDuFil } from '@/lib/queries/customer-timeline';

/** Le paramètre d'URL du filtre du fil (absent : « Tout »). */
export const PARAMETRE_DU_FILTRE = 'fil';

/** Les filtres du fil, dans l'ordre des puces, et le type de l'API que chacun demande. */
export const FILTRES_DU_FIL = [
  { cle: 'tout', type: null },
  { cle: 'notes', type: 'note' },
  { cle: 'visites', type: 'visit' },
  { cle: 'appels', type: 'contact' },
  { cle: 'etapes', type: 'stage' },
] as const satisfies readonly { readonly cle: string; readonly type: TypeDuFil | null }[];

export type CleDeFiltre = (typeof FILTRES_DU_FIL)[number]['cle'];

/** Le filtre lu dans l'URL ; une valeur inconnue vaut « Tout » (jamais un 422 de l'API). */
export function filtreDeLURL(valeur: string | null | undefined): CleDeFiltre {
  return FILTRES_DU_FIL.find((f) => f.cle === valeur && f.cle !== 'tout')?.cle ?? 'tout';
}

/** Les types demandés à l'API pour un filtre ; `null` : tous. */
export function typesDuFiltre(cle: CleDeFiltre): readonly TypeDuFil[] | null {
  const type = FILTRES_DU_FIL.find((f) => f.cle === cle)?.type ?? null;
  return type === null ? null : [type];
}

/** La requête de l'URL avec ce filtre posé (« Tout » retire le paramètre) ; les autres paramètres restent. */
export function requeteAvecFiltre(actuelle: URLSearchParams | string, cle: CleDeFiltre): string {
  const p = new URLSearchParams(actuelle);
  if (cle === 'tout') p.delete(PARAMETRE_DU_FILTRE);
  else p.set(PARAMETRE_DU_FILTRE, cle);
  const qs = p.toString();
  return qs ? `?${qs}` : '';
}

/** Les entrées de toutes les pages lues, dans l'ordre de l'API, sans doublon (une page relue). */
export function entreesDesPages(pages: readonly { readonly data: readonly EntreeDuFil[] }[] | undefined): EntreeDuFil[] {
  const vues = new Set<string>();
  const entrees: EntreeDuFil[] = [];
  for (const page of pages ?? []) {
    for (const e of page.data) {
      const cle = `${e.type}:${e.id}:${e.type === 'visit' ? e.milestone : ''}`;
      if (vues.has(cle)) continue;
      vues.add(cle);
      entrees.push(e);
    }
  }
  return entrees;
}

/** La page suivante à lire, ou `undefined` à la dernière. */
export function pageSuivante(derniere: { readonly meta?: { readonly current_page?: number; readonly last_page?: number } }): number | undefined {
  const courante = derniere.meta?.current_page ?? 1;
  const derniereLue = derniere.meta?.last_page ?? 1;
  return courante < derniereLue ? courante + 1 : undefined;
}
