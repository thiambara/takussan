import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { urlApiServeur } from '@/lib/api';
import { statutSansCorps } from '@/lib/statut-sans-corps';
import { DELAI_RELAIS_FICHIER_MS, enTetesDuRelais, fetchVersApi } from '@/lib/relais-api';

/**
 * TCK-613 (ADR-0044 §2) — le lien du courriel « Votre export du journal d'audit est prêt ».
 *
 * Le fichier porte le journal de toute une agence : il n'est plus un droit au porteur. L'API le sert
 * sous `auth:sanctum`, au seul demandeur signé, et journalise le téléchargement ; ce relais lui
 * passe le chemin signé (RELATIF : `expires`, `signature`, `user`, `file`, `name`) **octet pour
 * octet** — la signature se recalcule sur la chaîne brute — avec le jeton de la session.
 *
 * Sans session, le clic depuis la messagerie mène à la connexion, qui ramène ici. Une requête de
 * navigation douce (en-tête `RSC`, ce que fait le routeur après la connexion) n'atteint pas l'API :
 * elle reçoit une réponse non-RSC, et le routeur repasse en navigation complète — le seul
 * téléchargement réel, donc la seule ligne de journal.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (request.headers.get('rsc') !== null) {
    return new NextResponse(null, { status: 204, headers: { 'content-type': 'text/plain' } });
  }

  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) {
    const connexion = new URL('/auth/login', request.url);
    connexion.searchParams.set('redirect', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(connexion);
  }

  const upstream = await fetchVersApi(urlApiServeur(`/activity-logs/export/download${request.nextUrl.search}`), {
    headers: {
      ...(await enTetesDuRelais(request)),
      Accept: 'text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/json',
      Authorization: `Bearer ${token}`,
    },
    redirect: 'manual',
  }, { requete: request, delaiMs: DELAI_RELAIS_FICHIER_MS });
  const headers: HeadersInit = {};
  for (const key of ['content-type', 'content-disposition', 'content-length', 'cache-control']) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  return new NextResponse(statutSansCorps(upstream.status) ? null : upstream.body, { status: upstream.status, headers });
}
