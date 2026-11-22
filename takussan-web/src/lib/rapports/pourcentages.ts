import type { Formatteurs } from '@/lib/format/useFormatteurs';

/**
 * TCK-2801 — LA règle des pourcentages de « Rapports » (fiche TCK-2628, O4) : l'API rend des POURCENTAGES
 * (3,91 et non 0,0391). Une valeur MESURÉE (tuile, total et infobulle d'un graphique, valeur actuelle d'une
 * alerte, aperçu de « Personnaliser ») s'écrit à une décimale au plus : « 3,9 % » partout, là où la page
 * écrivait « 4 % » sur la tuile, « 3,9 % » dans le panneau et « 3,91 % » dans l'alerte. Un seuil SAISI
 * s'écrit tel qu'on l'a saisi (deux décimales au plus) : l'arrondir réécrirait la règle de l'agence. Les
 * graduations d'un axe restent entières (`GraphiqueDuMois`).
 */
export function pourcentMesure(f: Pick<Formatteurs, 'pourcentage'>, valeur: number, seuil?: number): string {
  return f.pourcentage(valeur / 100, { maximumFractionDigits: decimalesFaceAuSeuil(valeur, seuil) });
}

/**
 * Face à un SEUIL (la valeur actuelle d'une alerte), une décimale ne suffit pas toujours : 3,95 mesuré pour un
 * seuil de 3,95 s'écrirait « 4 % », qui le dirait franchi ; 10,04 pour 10 s'écrirait « 10 % », qui le dirait égal.
 * On garde alors autant de décimales que le seuil peut en porter (deux, `pourcentSaisi`) : assez pour que
 * l'arrondi reste du même côté du seuil que la mesure. Au-delà, l'API ne sert pas plus fin.
 */
function decimalesFaceAuSeuil(valeur: number, seuil: number | undefined): number {
  if (seuil === undefined || !Number.isFinite(seuil)) return 1;
  const arrondi = Math.round(valeur * 10) / 10;
  return Math.sign(arrondi - seuil) === Math.sign(valeur - seuil) ? 1 : 2;
}

export function pourcentSaisi(f: Pick<Formatteurs, 'pourcentage'>, valeur: number): string {
  return f.pourcentage(valeur / 100, { maximumFractionDigits: 2 });
}
