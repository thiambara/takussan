import { valeurBornee } from '@/hooks/useVueDansLUrl';
import type { FiltreDesDemandes } from '@/lib/queries/contact-leads';

export const FILTRES_DES_DEMANDES: readonly FiltreDesDemandes[] = ['todo', 'handled', 'all'];

/**
 * TCK-2479 — le filtre de la boîte « Demandes » vit dans `?filtre=` (patron TCK-1732), « À traiter »
 * par défaut. Tenu en `useState`, il ne survivait ni au rechargement ni au lien — et la pastille
 * « À traiter » du menu n'avait aucun paramètre à viser.
 */
export function filtreDesDemandes(params: Pick<URLSearchParams, 'get' | 'toString'>): FiltreDesDemandes {
  return valeurBornee(params, 'filtre', FILTRES_DES_DEMANDES) ?? 'todo';
}
