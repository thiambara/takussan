import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { urlApiServeur } from '@/lib/api';
import { enTetesDuRelais, fetchVersApi } from '@/lib/relais-api';

export async function GET(request: NextRequest) {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ data: {} });
  const upstream = await fetchVersApi(urlApiServeur('/feature-flags/me'), {
    headers: { ...(await enTetesDuRelais(request)), Accept: 'application/json', Authorization: `Bearer ${token}` },
  }, { requete: request });
  const body = await upstream.text();
  const headers: HeadersInit = {};
  const cache = upstream.headers.get('cache-control');
  if (cache) headers['Cache-Control'] = cache;

  return new NextResponse(body, { status: upstream.status, headers });
}
