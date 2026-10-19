/**
 * Le résumé d'un texte libre pour une `<meta name="description">` — TCK-915 (P09.08).
 *
 * Trois défauts qu'il ferme, mesurés sur la fiche, le profil d'agent et la page d'agence :
 *
 * - `texte?.slice(0, 160) ?? repli` coupait au caractère, au milieu d'un mot ;
 * - une description `""` passait le `??` : la page servait une description vide au lieu du repli ;
 * - la bio d'agent et la description d'agence passaient entières, quelle que soit leur longueur.
 *
 * Rend `undefined` quand il n'y a rien à dire, pour que l'appelant enchaîne son repli par `??`.
 * Au-delà de `max`, coupe au dernier mot entier (ponctuation finale retirée) et ajoute `…`, le
 * tout tenant dans `max` caractères. Un seul mot plus long que `max` est coupé au caractère.
 */
export function resumePourMeta(texte: string | null | undefined, max = 160): string | undefined {
  const plat = (texte ?? '').replace(/\s+/g, ' ').trim();
  if (plat === '') return undefined;
  if (plat.length <= max) return plat;

  const place = plat.slice(0, max - 1);
  const dernierBlanc = place.lastIndexOf(' ');
  const coupe = dernierBlanc > 0 ? place.slice(0, dernierBlanc) : place;
  return `${coupe.replace(/[\s,;:.!?…-]+$/, '')}…`;
}
