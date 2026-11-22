/**
 * TCK-2480 (ADR-0089 §6) — la barre de `/app` réduite aux icônes : un réglage de l'APPAREIL (il dépend
 * de l'écran, pas de la personne), dans un cookie non `httpOnly` que le layout serveur lit pour rendre
 * la bonne largeur au premier octet.
 *
 * - `auto` (aucun cookie) : réduite entre `md` et `lg` (le contenu passe de 464 à 656 px à 768,
 *   TCK-505). Décidé en CSS — variante `icones:` de `globals.css` — puisque le serveur ne connaît pas
 *   la largeur de l'écran ;
 * - `icones` (`menu_icones=1`) et `complet` (`menu_icones=0`) : le choix explicite l'emporte.
 */
export type ModeIcones = 'auto' | 'icones' | 'complet';

export const COOKIE_MENU_ICONES = 'menu_icones';

/** La plage du défaut `auto`, AU CARACTÈRE PRÈS celle de la variante `icones:` (`mode-icones.test.ts`). */
export const PLAGE_ICONES_AUTO = '(width >= 48rem) and (width < 64rem)';

const UN_AN_EN_SECONDES = 60 * 60 * 24 * 365;

export function modeIconesDepuisCookie(valeur: string | undefined): ModeIcones {
  if (valeur === '1') return 'icones';
  if (valeur === '0') return 'complet';
  return 'auto';
}

/** Le cookie d'un choix explicite ; `auto` l'efface (`max-age=0`). */
export function cookieDuModeIcones(mode: ModeIcones, securise: boolean): string {
  const valeur = mode === 'icones' ? '1' : '0';
  const age = mode === 'auto' ? 0 : UN_AN_EN_SECONDES;
  const cookie = `${COOKIE_MENU_ICONES}=${valeur}; path=/app; max-age=${age}; samesite=lax`;
  return securise ? `${cookie}; secure` : cookie;
}

export function ecrireModeIcones(mode: ModeIcones): void {
  document.cookie = cookieDuModeIcones(mode, window.location.protocol === 'https:');
}
