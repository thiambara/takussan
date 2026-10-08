import { NextRequest, NextResponse } from 'next/server';

import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { API_URL, effacerLaSession } from '@/lib/impersonation-serveur';

/**
 * TCK-600 (ADR-0055 §6) — terminer la session : `stop` avec le jeton de l'OPÉRATEUR (l'API ferme
 * la session ouverte de l'appelant), puis effacement des deux cookies — même si l'API répond 404
 * (session déjà échue et fermée par la commande) : le navigateur ne garde jamais un cookie mort.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const operateur = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!operateur) {
    const reponse = NextResponse.json({ code: 'unauthenticated' }, { status: 401 });
    effacerLaSession(reponse);
    return reponse;
  }

  const amont = await fetch(`${API_URL}/api/admin/impersonate/stop`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${operateur}` },
  }).catch(() => null);
  const corps = amont ? await amont.json().catch(() => null) : null;

  const reponse = NextResponse.json(corps ?? { code: 'server_error' }, { status: amont?.status ?? 502 });
  effacerLaSession(reponse);
  return reponse;
}
