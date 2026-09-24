/**
 * TCK-554 — une zone tactile de 44 × 44 px, centrée sur un contrôle plus PETIT que son dessin ne
 * l'est, sans agrandir ce dessin.
 *
 * Le favori et le comparateur des cartes font 32 px (40 px pour le favori d'une carte large) :
 * sous le seuil de 44 px, et empilés à 6 px d'écart à 390 px de large (mesuré le 2026-09-23), si
 * bien qu'un tap imprécis déclenchait le voisin. Le pseudo-élément `::before` agrandit la cible et
 * laisse le rond tel quel.
 *
 * ⚠ Deux conditions, que ce fichier ne peut pas tenir seul :
 * - le contrôle doit être **positionné** (`relative`) — c'est lui qui borne le pseudo-élément ;
 * - deux contrôles voisins doivent être écartés d'au moins `44 − dessin` px au total, sinon leurs
 *   zones se chevauchent : 12 px entre deux ronds de 32 px, 8 px entre un rond de 40 et un de 32.
 *
 * ⚠ Un ancêtre en `overflow-hidden` rogne aussi la zone : le contrôle doit garder au moins
 * `(44 − dessin) / 2` px de marge dans cet ancêtre — et davantage dans un coin ARRONDI. Mesuré le
 * 2026-09-23 : un rond de 32 px à 8 px du coin d'une photo `rounded-xl` (format compact de
 * `PropertyCard`, variante `Compact`) perd 4 à 6 points sur 1936 de sa zone, tous hors de l'arrondi
 * de la photo, donc hors du dessin de la carte.
 */
export const ZONE_TACTILE_44 =
  'relative before:absolute before:left-1/2 before:top-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2';
