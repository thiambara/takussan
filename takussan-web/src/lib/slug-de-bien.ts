/**
 * La FORME d'un slug de bien — TCK-598, après verif-598 (m2, m3, m5).
 *
 * L'API le fabrique par `Str::slug($titre).'-'.Str::random(6)` : des lettres ASCII, des chiffres,
 * des tirets — et un tiret EN TÊTE quand le titre n'a aucune lettre latine (`Str::slug` rend alors
 * `''`, mesuré sur un titre en émojis, en CJK ou fait de `---`). D'où un premier caractère libre.
 *
 * ⚠️ `encodeURIComponent` seul ne suffit pas à faire d'une valeur venue du visiteur UN segment de
 * chemin : il laisse `.` et `..` intacts, et `fetch` les RÉSOUT (`/public/properties/..` devient
 * `/public/`). Toute valeur qui n'a pas cette forme désigne donc un bien INTROUVABLE, sans appel.
 */
export const FORME_DE_SLUG = /^[A-Za-z0-9_-]{1,255}$/;

export function estSlugDeBien(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && FORME_DE_SLUG.test(valeur);
}

/** Le segment de chemin d'un slug de bien, encodé ; `null` si la valeur n'en est pas un. */
export function segmentDeSlug(valeur: unknown): string | null {
  return estSlugDeBien(valeur) ? encodeURIComponent(valeur) : null;
}
