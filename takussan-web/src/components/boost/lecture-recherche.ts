import type { PropertyListItem } from '@/types/property';
import type { BoostPlacement, BoostVariant } from './types';

/**
 * TCK-633 lot F (ADR-0061 §7) — lire les champs neufs de la recherche sans éditer les types
 * partagés : `sponsored` (racine de la réponse), `placement` et `badge` (chaque bien).
 */
export function lireEmplacements(resultat: unknown): PropertyListItem[] {
  const brut = (resultat as { sponsored?: unknown } | null | undefined)?.sponsored;
  return Array.isArray(brut) ? (brut as PropertyListItem[]) : [];
}

export function placementDe(bien: PropertyListItem): BoostPlacement {
  const valeur = (bien as { placement?: unknown }).placement;
  // `organic` par défaut : un bien sans `placement` (ancienne réponse, autre liste) est organique.
  return valeur === 'reserved' || valeur === 'sponsored' ? valeur : 'organic';
}

export function badgeDe(bien: unknown): BoostVariant | null {
  const valeur = (bien as { badge?: unknown } | null)?.badge;
  return valeur === 'urgent' || valeur === 'price_drop' ? valeur : null;
}
