import { cache } from 'react';
import { getMe } from '@/lib/auth';
import { getActiveProfileId, getToken } from '@/lib/session';
import type { User } from '@/types/user';

/**
 * L'utilisateur de l'espace applicatif, lu UNE fois par rendu — TCK-1374 (P138.02, P138.03).
 *
 * Le jeton est celui de {@link getToken} (la cible pendant une impersonation) et l'indice de
 * profil celui de {@link getActiveProfileId} (aucun pendant une impersonation). La mise en page
 * racine, `getMeAction` et, hors impersonation, `getMeOperateurAction` partagent cette promesse :
 * un seul `GET /api/auth/me` par document, et le `user` remis à `AuthProvider` est lu sous le même
 * profil actif que celui avec lequel le serveur rend la page.
 *
 * Elle ne décide rien des erreurs : elle rend `null` sans jeton et rejette sur toute erreur de
 * l'API. La racine en fait un visiteur anonyme ; `getMeAction` redirige sur un 401.
 *
 * ⚠ `cache()` de React est la SEULE déduplication des lectures serveur : `apiRequest` pose un
 * `X-Request-Id` neuf sur chaque appel, et la mémoïsation de `fetch` par Next ne fusionne jamais
 * deux appels dont un en-tête diffère (P138.01).
 */
export const utilisateurDuRendu = cache(async (): Promise<User | null> => {
  const token = await getToken();
  if (!token) return null;
  return getMe(token, await getActiveProfileId());
});
