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

export async function clearToken(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
  // The active-profile selection is bound to a specific user session: leaving
  // it set across a session boundary causes the resolver to forward a stale
  // profile id (e.g. after `migrate:fresh --seed`) and 403 the next request.
  cookieStore.delete(ACTIVE_PROFILE_COOKIE);
}
