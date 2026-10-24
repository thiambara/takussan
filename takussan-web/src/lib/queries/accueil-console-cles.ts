/**
 * TCK-1828 (P136.05) — les clés TanStack de l'accueil de `/super-admin`, partagées par ses
 * composants et par la lecture serveur de la page (`accueil-console.ts`). Sans dépendance : les
 * composants client les importent sans tirer les lecteurs serveur.
 */
export const CLE_METRIQUES_SYSTEME = ['super-admin', 'system-metrics'] as const;

/** Le bas de l'accueil : ce qui vient de se passer, pas ce qu'on peut y chercher. */
export const ACTIVITE_RECENTE_ENTREES = 5;
export const CLE_ACTIVITE_RECENTE = ['super-admin', 'audit', 'recent', ACTIVITE_RECENTE_ENTREES] as const;
