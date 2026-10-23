import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';
import { urlApiServeur } from '@/lib/api';
import { statutSansCorps } from '@/lib/statut-sans-corps';
import { DELAI_RELAIS_FICHIER_MS, enTetesDuRelais, fetchVersApi } from '@/lib/relais-api';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const id = segmentAmont((await ctx.params).id);
  if (id === null) return reponseSegmentInvalide();

  const upstream = await fetchVersApi(urlApiServeur(`/data-exports/${id}/download`), {
    headers: {
      ...(await enTetesDuRelais(request)),
      Accept: 'application/zip,application/json',
      Authorization: `Bearer ${token}`,
    },
    // TCK-1816 (P108.04) — une redirection de l'API est rendue au navigateur, pas suivie ici.
    redirect: 'manual',
  }, { requete: request, delaiMs: DELAI_RELAIS_FICHIER_MS });
  const headers: HeadersInit = {};
  for (const key of ['content-type', 'content-disposition', 'content-length', 'location']) {
    const value = upstream.headers.get(key);
    if (value) headers[key] = value;
  }
  // TCK-1816 (P108.04) — l'archive est relayée en flux, sans être chargée en mémoire.
  return new NextResponse(statutSansCorps(upstream.status) ? null : upstream.body, { status: upstream.status, headers });
}
