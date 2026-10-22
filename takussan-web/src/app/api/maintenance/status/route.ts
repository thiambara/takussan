import { NextResponse } from 'next/server';
import { enTetesServeurAmont, urlApiServeur } from '@/lib/api';
import { fetchVersApi } from '@/lib/relais-api';

export async function GET() {
  // TCK-894 — appel partagé, mis en cache pour tous : le chemin serveur, sans l'IP ni la langue
  // d'un visiteur, qui entreraient dans la clé du cache de `fetch`.
  // TCK-1221 (P79.06) — `fetchVersApi` : une API sans réponse rend un 502 ou 504 JSON au lieu de
  // faire lever la route. Aucune requête du visiteur transmise : l'appel reste partagé.
  const upstream = await fetchVersApi(urlApiServeur('/maintenance/status'), {
    headers: { ...(await enTetesServeurAmont({ partage: true })), Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  const body = await upstream.text();
  const headers: HeadersInit = {};
  const cache = upstream.headers.get('cache-control');
  if (cache) headers['Cache-Control'] = cache;

  return new NextResponse(body, { status: upstream.status, headers });
}
