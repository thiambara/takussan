import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';
import { urlApiServeur } from '@/lib/api';
import { statutSansCorps } from '@/lib/statut-sans-corps';
import { DELAI_RELAIS_FICHIER_MS, enTetesDuRelais, fetchVersApi } from '@/lib/relais-api';

type Ctx = { params: Promise<{ id: string }> };

/**
 * TCK-2868 — « Retélécharger » un export gardé (`GET /api/me/exports/{id}/download`, TCK-2866, ADR-0115) :
 * le fichier est relayé en flux, avec son nom (`Content-Disposition`, lisible ici puisque même origine) ;
 * un 403 (autre auteur, ou plus le droit de le refaire) et un 410 (échéance passée) passent tels quels,
 * l'écran les dit. Même forme que le relais de `data-exports/{id}/download`.
 */
export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const id = segmentAmont((await ctx.params).id);
  if (id === null) return reponseSegmentInvalide();

  const upstream = await fetchVersApi(urlApiServeur(`/me/exports/${id}/download`), {
    headers: {
      ...(await enTetesDuRelais(request)),
      Accept: '*/*',
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
