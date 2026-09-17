/**
 * Les URL CANONIQUES des trois documents juridiques — TCK-531, `docs/features.md` §2.10.
 *
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE CONSTANTE, ET UNE SEULE
 * ────────────────────────────────────────────────────────────────────────────────────────────────
 *
 * Trois cases de consentement OBLIGATOIRES renvoyaient à trois chemins différents — `/terms`,
 * `/privacy`, `/legal/cgu` — et aucun n'était une page : 404 pour les trois, relevé le 2026-09-16.
 * Chacune avait écrit sa cible à la main. Une personne à qui l'on demandait d'accepter des
 * conditions ne pouvait pas les lire.
 *
 * Toute référence à ces documents passe désormais par cet objet, et
 * `src/lib/__tests__/legal-routes.test.ts` refuse un chemin juridique écrit en dur ailleurs dans
 * `src/` — c'est ce qui fait tenir l'AC2 (« les trois cases citent les MÊMES URL ») sans liste
 * de fichiers à maintenir.
 *
 * Les chemins sont écrits SANS langue : `LienLocalise` ajoute le segment (ADR-0026), y compris
 * depuis `/auth/register` et `/onboarding/host`, qui ne sont pas localisés mais lisent la langue
 * du cookie.
 */
export const ROUTES_LEGALES = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
  notice: '/legal/notice',
} as const;

export type DocumentLegal = keyof typeof ROUTES_LEGALES;

/** L'ordre d'affichage — pied de page compris. */
export const DOCUMENTS_LEGAUX: readonly DocumentLegal[] = ['terms', 'privacy', 'notice'];
