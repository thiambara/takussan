/**
 * TCK-2628 (AC5) — les graduations d'un graphique de « Rapports » : des multiples ronds (« 50 M »,
 * « 100 M »), jamais « 101 394 241 ». Trois graduations, 0, un pas et deux pas, comme la maquette
 * (`app-rapports-pieces.tsx`, `GraphiqueMois`) : le pas est le plus petit de 1, 2, 2,5 et 5 × 10ⁿ qui,
 * doublé, couvre le maximum de la série.
 *
 * Mesuré sur les séries de la maquette : 95,2 → 0 · 50 · 100 ; 33,7 → 0 · 20 · 40 ; 18,7 → 0 · 10 · 20 ;
 * 1,6 → 0 · 1 · 2.
 */
const MULTIPLES = [1, 2, 2.5, 5, 10] as const;

export function pasRond(maximum: number): number {
  if (!Number.isFinite(maximum) || maximum <= 0) return 1;
  const brut = maximum / 2;
  const ordre = 10 ** Math.floor(Math.log10(brut));
  const multiple = MULTIPLES.find((m) => m * ordre >= brut - ordre * 1e-9) ?? 10;
  // Les flottants : 2,5 × 0,1 vaut 0,25000000000000006 ; l'arrondi à 12 chiffres significatifs le rend net.
  return Number((multiple * ordre).toPrecision(12));
}

/** Les trois graduations (0, un pas, deux pas) d'une série positive ; le haut du repère est la dernière. */
export function graduationsRondes(valeurs: readonly (number | null)[]): readonly number[] {
  const lues = valeurs.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const pas = pasRond(Math.max(0, ...lues));
  return [0, pas, Number((2 * pas).toPrecision(12))];
}

/**
 * La variation du dernier mois sur le précédent, en pour cent entier (« +8 % sur octobre »). `null` quand
 * elle n'a pas de sens : moins de deux mois, un mois manquant, ou un précédent nul (une division par zéro
 * n'est pas une hausse infinie).
 */
export function variationDuDernierMois(valeurs: readonly (number | null)[]): number | null {
  if (valeurs.length < 2) return null;
  const dernier = valeurs[valeurs.length - 1];
  const precedent = valeurs[valeurs.length - 2];
  if (typeof dernier !== 'number' || typeof precedent !== 'number' || precedent === 0) return null;
  return Math.round(((dernier - precedent) / Math.abs(precedent)) * 100);
}
