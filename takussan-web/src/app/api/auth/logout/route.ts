import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { logout } from '@/lib/auth';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    try {
      await logout(token);
    } catch {
      // Token already expired on backend — proceed to clear cookie
    }
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.delete(AUTH_COOKIE_NAME);
  // TCK-509 (AC6) — le profil actif est lié à la session qui se ferme. Seul `set-token` l'effaçait,
  // à la connexion SUIVANTE : entre les deux, le résolveur recevait un profil sans propriétaire.
  response.cookies.delete(ACTIVE_PROFILE_COOKIE);
  return response;
}
