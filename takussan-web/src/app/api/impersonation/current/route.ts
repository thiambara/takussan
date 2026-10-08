import { NextRequest, NextResponse } from 'next/server';

import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { API_URL, effacerLaSession } from '@/lib/impersonation-serveur';

const AUCUNE_SESSION = { code: 'impersonation.no_session' };

/**
 * TCK-600 (ADR-0055 §6) — la session en cours, pour la bannière : lue AVEC le jeton
 * d'impersonation. Session échue, fermée ou opérateur retiré : l'API répond 401 ou 404, et le
 * relais efface les cookies — la page revient à la console.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const jeton = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  if (!jeton) return NextResponse.json(AUCUNE_SESSION, { status: 404 });

  const amont = await fetch(`${API_URL}/api/impersonation/current`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${jeton}` },
    cache: 'no-store',
  }).catch(() => null);

  if (amont?.ok) {
    return NextResponse.json(await amont.json(), { status: 200 });
  }
  if (amont === null) return NextResponse.json({ code: 'server_error' }, { status: 502 });

  const reponse = NextResponse.json(AUCUNE_SESSION, { status: 404 });
  effacerLaSession(reponse);
  return reponse;
}
