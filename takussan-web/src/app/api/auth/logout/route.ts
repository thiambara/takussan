import { enTetesServeurAmont, urlApiServeur } from '@/lib/api';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { logout } from '@/lib/auth';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { effacerLaSession } from '@/lib/impersonation-serveur';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function POST(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (token) {
    // TCK-600 (ADR-0055 §6) — la déconnexion de l'opérateur ferme aussi sa session d'impersonation.
    if (cookieStore.get(IMPERSONATION_COOKIE)?.value) {
      await fetch(urlApiServeur('/admin/impersonate/stop'), {
        method: 'POST',
        headers: { ...(await enTetesServeurAmont()), Accept: 'application/json', Authorization: `Bearer ${token}` },
      }).catch(() => null);
    }
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
  effacerLaSession(response);
  return response;
}
