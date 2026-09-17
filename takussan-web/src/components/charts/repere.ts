/**
 * Une fraction du repère de tracé, en pourcentage CSS (TCK-532).
 *
 * Les étiquettes des graphiques sont du HTML posé en pourcentages autour d'un SVG étiré : c'est ce
 * qui leur garde une taille CSS fixe quelle que soit la largeur. L'arrondi à 4 décimales rend le
 * même attribut `style` au serveur et au client — un flottant brut n'a aucune raison d'en différer,
 * mais une chaîne courte se relit.
 */
export function pourcent(fraction: number): string {
  return `${Number((fraction * 100).toFixed(4))}%`;
}
