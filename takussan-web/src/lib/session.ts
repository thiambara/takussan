import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from './constants';
import { IMPERSONATION_COOKIE } from './impersonation';
import { ACTIVE_PROFILE_COOKIE } from './profiles';
import { COOKIE_CHOIX_CLIENT } from './espaces';
import { COOKIE_MENU_ICONES, modeIconesDepuisCookie, type ModeIcones } from './navigation/mode-icones';

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

/**
 * TCK-2480 — le mode icônes de la barre de `/app` sur CET appareil (cookie `menu_icones`, non
 * `httpOnly`, écrit par le navigateur). Lu par le layout pour rendre la bonne largeur au premier octet.
 */
export async function getModeIconesDuMenu(): Promise<ModeIcones> {
  const cookieStore = await cookies();
  return modeIconesDepuisCookie(cookieStore.get(COOKIE_MENU_ICONES)?.value);
}

/** TCK-2621 — une session d'impersonation est-elle ouverte (jeton d'impersonation présent) ? */
export async function estEnImpersonation(): Promise<boolean> {
  const cookieStore = await cookies();
  return Boolean(cookieStore.get(IMPERSONATION_COOKIE)?.value);
}

/** TCK-2621 — le témoin « Continuer en tant que client » de la session (`COOKIE_CHOIX_CLIENT`). */
export async function getChoixClient(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_CHOIX_CLIENT)?.value;
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
