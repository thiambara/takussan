import { IntlErrorCode, type IntlError } from 'next-intl';

/**
 * Ce que fait le front quand une clé de traduction est ABSENTE du dictionnaire fourni au rendu.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI ÇA LÈVE — ET POURQUOI SEULEMENT HORS PRODUCTION
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Depuis TCK-337, le dictionnaire n'est plus servi en entier : chaque frontière de rendu ne reçoit
 * que les espaces de noms que son sous-arbre peut atteindre. Le mode de défaillance de ce
 * découpage est **silencieux dans les quatre gardes existantes** : un espace oublié ne casse ni
 * `next build`, ni ESLint, ni `tsc --noEmit`, ni les ~810 tests. next-intl signale un
 * `MISSING_MESSAGE` sur la console et son `getMessageFallback` par défaut **peint le chemin de la
 * clé à l'écran** — `dashboard.shortcuts.heading` en toutes lettres, à un utilisateur.
 *
 * Autrement dit : le pire correctif imaginable — `messages={{}}` — donne le MEILLEUR chiffre de
 * poids et ne fait rougir aucune vérification. Une mesure de poids ne peut donc pas, à elle seule,
 * servir de critère d'acceptation. C'est cette fonction qui rend le découpage falsifiable.
 *
 * **Hors production, on lève.** Un espace de noms oublié devient une erreur de rendu — visible en
 * développement à la première visite, et rouge dans tout test qui monte le provider. C'est le seul
 * moment où l'oubli coûte encore quelque chose de réparable.
 *
 * **En production, on n'ose pas.** Lever y transformerait une clé manquante — un défaut cosmétique
 * sur un chemin rare — en écran d'erreur, voire en boucle de frontière d'erreur si la clé manquante
 * est justement celle du message d'erreur. Le repli de next-intl reste laid ; il reste préférable à
 * une page morte. On journalise, et la garde `check-i18n-namespaces.mjs` est ce qui empêche d'en
 * arriver là.
 *
 * ⚠️ On ne lève QUE sur `MISSING_MESSAGE`. `ENVIRONMENT_FALLBACK`, `INVALID_MESSAGE` et les autres
 * codes décrivent des conditions qui n'ont rien à voir avec le découpage ; les rendre fatales
 * ferait de cette fonction une source de pannes au lieu d'une garde.
 */
export function surErreurIntl(erreur: IntlError): void {
  if (erreur.code === IntlErrorCode.MISSING_MESSAGE && process.env.NODE_ENV !== 'production') {
    throw erreur;
  }
  console.error(erreur);
}
