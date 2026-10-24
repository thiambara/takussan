import { ApiError } from '@/lib/api';
import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { getMe } from '@/lib/auth';
import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { effacerLaSession } from '@/lib/impersonation-serveur';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(null, { status: 401 });
  }

  // TCK-600 (ADR-0055 §6) — pendant une session, l'utilisateur de la page est la CIBLE, sans le
  // profil actif de l'opérateur. Session échue ou fermée : les cookies tombent et l'opérateur
  // retrouve son propre compte — jamais un 401 qui le déconnecterait.
  const impersonation = cookieStore.get(IMPERSONATION_COOKIE)?.value;
  if (impersonation) {
    try {
      return NextResponse.json(await getMe(impersonation));
    } catch {
      const repli = await reponseOperateur(token, cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value);
      effacerLaSession(repli);
      return repli;
    }
  }

  return reponseOperateur(token, cookieStore.get(ACTIVE_PROFILE_COOKIE)?.value);
}

async function reponseOperateur(token: string, activeProfileId: string | undefined): Promise<NextResponse> {
  try {
    const user = await getMe(token, activeProfileId);
    return NextResponse.json(user);
  } catch (err) {
    // TCK-1992 (P172.01) — 401 seulement sur un 401 de l'API : `refreshUser` ferme la session sur
    // ce statut, et une API en panne, lente ou injoignable ne dit rien de la session. Une
    // `ApiError` garde son statut ; une absence de réponse rend 503.
    const status = err instanceof ApiError && err.status >= 400 ? err.status : 503;
    return NextResponse.json(null, { status });
  }
}
