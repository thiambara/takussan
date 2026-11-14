import { valeurBornee } from '@/hooks/useVueDansLUrl';
import type { AffinageDesDemandes, CanalDeDemande, FiltreDesDemandes } from '@/lib/queries/contact-leads';

/**
 * TCK-2584 — les vues, dans l'ordre des puces : À traiter · Non attribuées · À moi · Traitées ·
 * Toutes. « Non attribuées » n'est montrée qu'au personnel qui attribue (`crm.assign`).
 */
export const FILTRES_DES_DEMANDES: readonly FiltreDesDemandes[] = ['todo', 'unassigned', 'mine', 'handled', 'all'];

export const CANAUX_DES_DEMANDES: readonly CanalDeDemande[] = ['form', 'whatsapp', 'call'];

/**
 * TCK-2479 — le filtre de la boîte « Demandes » vit dans `?filtre=` (patron TCK-1732), « À traiter »
 * par défaut. Tenu en `useState`, il ne survivait ni au rechargement ni au lien — et la pastille
 * « À traiter » du menu n'avait aucun paramètre à viser.
 */
export function filtreDesDemandes(params: Pick<URLSearchParams, 'get' | 'toString'>): FiltreDesDemandes {
  return valeurBornee(params, 'filtre', FILTRES_DES_DEMANDES) ?? 'todo';
}

/** Un identifiant de l'URL : un entier positif, sinon `null`. */
export function identifiantDeLUrl(brut: string | null | undefined): number | null {
  if (!brut || !/^\d+$/.test(brut)) return null;
  const id = Number(brut);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * TCK-2584 — la recherche (`?q=`) et les filtres du bureau (`?bien=`, `?agent=`, `?canal=`), dans
 * l'URL comme la vue : ils survivent au rechargement et au lien copié.
 */
export function affinageDesDemandes(params: Pick<URLSearchParams, 'get' | 'toString'>): AffinageDesDemandes {
  return {
    recherche: params.get('q')?.trim() || null,
    bien: identifiantDeLUrl(params.get('bien')),
    agent: identifiantDeLUrl(params.get('agent')),
    canal: valeurBornee(params, 'canal', CANAUX_DES_DEMANDES),
  };
}
