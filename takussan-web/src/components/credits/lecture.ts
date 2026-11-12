import type { BoostKind, BoostProduct, BoostVariant, CreditLot } from '@/components/boost/types';

/**
 * TCK-2664 — les lectures de la page Crédits, sans rendu : ce qui expire bientôt, la grille des offres
 * telle que l'API la rend (jamais un prix écrit dans le code), les jours restants d'une mise en avant.
 */

/** La famille d'une offre, telle que la grille la montre : une ligne par famille. */
export type FamilleDOffre = 'bump' | 'featured' | 'urgent' | 'price_drop';

export const FAMILLES: readonly FamilleDOffre[] = ['bump', 'featured', 'urgent', 'price_drop'];

export function familleDe(kind: BoostKind, variant: BoostVariant | null): FamilleDOffre {
  if (kind === 'badge') return variant === 'price_drop' ? 'price_drop' : 'urgent';
  return kind;
}

export interface LigneDeGrille {
  readonly famille: FamilleDOffre;
  /** Les offres actives de la famille, de la plus courte à la plus longue. */
  readonly offres: readonly BoostProduct[];
}

/** La grille « Ce que ça coûte » : les familles qui ont au moins une offre active, dans l'ordre fixe. */
export function grilleDesOffres(produits: readonly BoostProduct[]): readonly LigneDeGrille[] {
  const actives = produits.filter((p) => p.is_active);
  return FAMILLES.map((famille) => ({
    famille,
    offres: actives
      .filter((p) => familleDe(p.kind, p.variant) === famille)
      .sort((a, b) => a.duration_days - b.duration_days || a.sort_order - b.sort_order || a.id - b.id),
  })).filter((l) => l.offres.length > 0);
}

/**
 * « 60 expirent le 24 déc. » : les crédits des lots qui expirent le PREMIER jour d'expiration à venir
 * (le jour, pas l'instant : deux lots du même jour se somment). `null` si aucun lot n'expire.
 */
export function prochaineExpiration(lots: readonly CreditLot[]): { readonly date: string; readonly credits: number } | null {
  const jour = (iso: string) => iso.slice(0, 10);
  const expirants = lots.filter((l) => l.expires_at !== null && l.remaining_amount > 0);
  if (expirants.length === 0) return null;
  const premier = expirants.map((l) => l.expires_at as string).sort()[0];
  const credits = expirants.filter((l) => jour(l.expires_at as string) === jour(premier)).reduce((s, l) => s + l.remaining_amount, 0);
  return { date: premier, credits };
}

const JOUR = 86_400_000;

/** Les jours entiers qui restent jusqu'à `fin` (arrondis au jour supérieur ; 0 une fois passée). */
export function joursRestants(fin: string, maintenant: number): number {
  return Math.max(0, Math.ceil((Date.parse(fin) - maintenant) / JOUR));
}
