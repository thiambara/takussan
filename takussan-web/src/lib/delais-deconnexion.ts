/**
 * TCK-1481 (P113.05) — les deux échéances de la déconnexion. Sur une API figée, le relais attendait
 * l'API sans borne utile avant d'effacer les cookies, et le client attendait le relais sans borne
 * avant de vider son état : « Se déconnecter » ne produisait rien de visible. Décision du porteur
 * (2026-10-22) : attente bornée à quelques secondes, effacement quand même. Un jeton non révoqué
 * expire de lui-même côté API.
 *
 * Module à part, sans dépendance : les tests du relais simulent `@/lib/auth` en entier.
 */

/** L'échéance commune aux appels du relais vers l'API (`impersonate/stop`, puis `auth/logout`). */
export const DELAI_DECONNEXION_API_MS = 3_000;

/**
 * L'attente de `POST /api/auth/logout` par `AuthContext.logout()`. Au-dessus de celle du relais,
 * pour que la réponse qui efface les cookies arrive, dans le cas courant, avant que le client cesse
 * de l'attendre.
 */
export const DELAI_DECONNEXION_MS = 5_000;
