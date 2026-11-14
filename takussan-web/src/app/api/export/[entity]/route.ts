import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';
import { urlApiServeur } from '@/lib/api';
import { DELAI_RELAIS_FICHIER_MS, enTetesDuRelais, fetchVersApi } from '@/lib/relais-api';

const ALLOWED_ENTITIES = new Set([
  'payments',
  'leases',
  'customers',
  'properties',
  // TCK-595 (§7) — les exports financiers de l'agence.
  'payouts',
  'invoices',
  'commissions',
  'aging',
  'deposits',
  // TCK-2721 — le registre des encaissements d'« Argent », avec ses filtres.
  'payment_history',
]);
const FORWARD_PARAMS = ['format', 'from', 'to', 'limit'] as const;
/**
 * TCK-2721 — les `filter[…]` de `GET /api/payments/history` que le relais transmet pour
 * `payment_history`, et eux seuls : une liste fermée, jamais la requête recopiée telle quelle.
 */
const FILTRES_DU_REGISTRE = [
  'entity_type',
  'entity_id',
  'status',
  'date_from',
  'date_to',
  'paid_from',
  'paid_to',
  'payer_id',
  'landlord_id',
  'payment_method',
  'search',
  'days_late_min',
  'days_late_max',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
): Promise<NextResponse> {
  const entity = segmentAmont((await params).entity);
  if (entity === null) return reponseSegmentInvalide();

  if (!ALLOWED_ENTITIES.has(entity)) {
    console.error('[BFF] export : entité inconnue', entity);
    return NextResponse.json({ code: 'unknown_entity' }, { status: 404 });
  }

  const cookieStore = await cookies();
  const token = jetonEspaceApplicatif(cookieStore);
  if (!token) {
    return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });
  }

  const upstream = new URL(urlApiServeur(`/export/${entity}`));
  for (const key of FORWARD_PARAMS) {
    const v = request.nextUrl.searchParams.get(key);
    if (v !== null && v !== '') upstream.searchParams.set(key, v);
  }
  if (entity === 'payment_history') {
    for (const cle of [...FILTRES_DU_REGISTRE.map((f) => `filter[${f}]`), 'sort']) {
      const v = request.nextUrl.searchParams.get(cle);
      if (v !== null && v !== '') upstream.searchParams.set(cle, v);
    }
  }

  const res = await fetchVersApi(upstream, {
    headers: { ...(await enTetesDuRelais(request)), Authorization: `Bearer ${token}`, Accept: '*/*' },
  }, { requete: request, delaiMs: DELAI_RELAIS_FICHIER_MS });

  const headers = new Headers();
  // TCK-1308 (P112.03) — `x-export-truncated` : l'API a coupé l'export au plafond, l'écran le dit.
  for (const h of ['content-type', 'content-disposition', 'content-length', 'cache-control', 'x-export-truncated']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new NextResponse(res.body, { status: res.status, headers });
}
