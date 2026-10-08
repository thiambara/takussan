import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from './constants';
import { IMPERSONATION_COOKIE } from './impersonation';
import { ACTIVE_PROFILE_COOKIE } from './profiles';

/**
 * Le jeton avec lequel le serveur du front parle à l'API pour l'ESPACE APPLICATIF.
 *
 * TCK-600 (ADR-0055 §6) — pendant une session d'impersonation, c'est le jeton d'impersonation :
 * l'espace applicatif se lit en tant que la cible. La console lit avec {@link getOperatorToken}.
 */
export async function getToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(IMPERSONATION_COOKIE)?.value ?? cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

/** TCK-600 — le jeton de l'opérateur lui-même, impersonation ou non : la console, et elle seule. */
export async function getOperatorToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

/**
 * TCK-600 (invariant 11) — le profil actif de l'opérateur n'accompagne JAMAIS le jeton
 * d'impersonation : pendant une session, aucun profil n'est transmis et l'API résout celui de la
 * cible.
 */
export async function getActiveProfileId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  if (cookieStore.get(IMPERSONATION_COOKIE)?.value) return undefined;
  return cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
}

/** Le profil actif de l'opérateur, pour la console. */
export async function getOperatorActiveProfileId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
}

// TCK-509 — pas d'effacement du cookie de session ici (`clearToken` a été retiré avec son seul
// appelant, `logoutAction`). Un effacement côté serveur que le client n'apprend pas laisse le
// navigateur sur le jeton révoqué : il appartient aux route handlers de `src/app/api/auth/`,
// derrière `useAuth().logout`.
