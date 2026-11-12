import type { PropertyListItem } from '@/types/property';

/**
 * TCK-2638 (lot B) — l'état d'annonce d'UNE ligne, la pastille de la carte du mode Annonces. Même
 * partition que `filter[listing]` (`Property::scopeListingState()`) : « En ligne » est `is_online`, servi
 * par l'API (ADR-0097 § 1 : jamais recomposé ici) ; parmi les biens qui ne le sont pas, le brouillon,
 * puis « À valider » (en attente ou en revue), puis tout le reste, « Hors ligne ».
 *
 * `null` quand la ligne n'a pas `is_online` (`include=online` absent) : sans lui, l'écran ne devine pas.
 */
export type EtatDAnnonce = 'enLigne' | 'aValider' | 'brouillon' | 'horsLigne';

const A_VALIDER: ReadonlySet<string> = new Set(['pending', 'pending_review']);

export function etatDAnnonce(property: Pick<PropertyListItem, 'is_online' | 'status'>): EtatDAnnonce | null {
  if (property.is_online === undefined) return null;
  if (property.is_online) return 'enLigne';
  if (property.status === 'draft') return 'brouillon';
  if (property.status && A_VALIDER.has(property.status)) return 'aValider';
  return 'horsLigne';
}

/**
 * Le statut mérite-t-il sa propre pastille à côté de l'état ? Non quand l'état le dit déjà (un
 * brouillon, un bien à valider) ou qu'il va de soi (un bien en ligne est disponible ou validé) ; oui
 * pour un bien hors ligne : « Loué », « Vendu », « Validé » d'un bien privé disent pourquoi.
 */
export function statutAMontrer(property: Pick<PropertyListItem, 'is_online' | 'status'>): boolean {
  const etat = etatDAnnonce(property);
  return etat === null || etat === 'horsLigne';
}
