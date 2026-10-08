import { NextRequest, NextResponse } from 'next/server';

import { IMPERSONATION_COOKIE } from '@/lib/impersonation';
import { API_URL, effacerLaSession } from '@/lib/impersonation-serveur';
import { cheminAmont, reponseSegmentInvalide } from '@/lib/segments-amont';

/**
 * TCK-600 (ADR-0055 §6) — le relais same-origin de l'espace applicatif pendant une session.
 *
 * `apiRequest`, dans le navigateur, y envoie ses appels quand le témoin de session est posé : le
 * jeton d'impersonation est ajouté ICI, côté serveur, et n'atteint jamais la page. Ne sont transmis
 * ni le profil actif de l'opérateur (`X-Profile-Id`, `X-Active-Profile-Hint`, invariant 11), ni ses
 * cookies. Toute méthode est relayée : c'est l'API qui refuse l'écriture (403
 * `impersonation.read_only`), avec son message traduit — une seule règle, un seul endroit.
 */
async function relayer(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const chemin = cheminAmont(segments);
  if (chemin === null) return reponseSegmentInvalide();
  const jeton = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  if (!jeton) {
    const reponse = NextResponse.json({ code: 'impersonation.no_session' }, { status: 401 });
    effacerLaSession(reponse);
    return reponse;
  }

  const enTetes: Record<string, string> = {
    Accept: request.headers.get('accept') ?? 'application/json',
    Authorization: `Bearer ${jeton}`,
  };
  for (const nom of ['content-type', 'accept-language']) {
    const valeur = request.headers.get(nom);
    if (valeur) enTetes[nom] = valeur;
  }

  const init: RequestInit = { method: request.method, headers: enTetes, cache: 'no-store' };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.arrayBuffer();
  }

  const amont = await fetch(`${API_URL}/api/${chemin}${request.nextUrl.search}`, init);
  const enTetesReponse: Record<string, string> = {};
  for (const nom of ['content-type', 'content-disposition', 'cache-control']) {
    const valeur = amont.headers.get(nom);
    if (valeur) enTetesReponse[nom] = valeur;
  }

  const reponse = new NextResponse(await amont.arrayBuffer(), { status: amont.status, headers: enTetesReponse });
  // 401 : la session est échue, fermée, ou l'opérateur n'est plus `super_admin` — le jeton est mort.
  if (amont.status === 401) effacerLaSession(reponse);
  return reponse;
}

type Ctx = { params: Promise<{ path: string[] }> };

async function gerer(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const { path } = await ctx.params;
  return relayer(request, path ?? []);
}

export const GET = gerer;
export const POST = gerer;
export const PUT = gerer;
export const PATCH = gerer;
export const DELETE = gerer;
