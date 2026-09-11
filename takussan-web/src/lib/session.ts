import { cookies } from 'next/headers';
import { AUTH_COOKIE_NAME } from './constants';
import { ACTIVE_PROFILE_COOKIE } from './profiles';

export async function getToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(AUTH_COOKIE_NAME)?.value;
}

export async function getActiveProfileId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value;
}

// TCK-509 — pas d'effacement du cookie de session ici (`clearToken` a été retiré avec son seul
// appelant, `logoutAction`). Un effacement côté serveur que le client n'apprend pas laisse le
// navigateur sur le jeton révoqué : il appartient aux route handlers de `src/app/api/auth/`,
// derrière `useAuth().logout`.
