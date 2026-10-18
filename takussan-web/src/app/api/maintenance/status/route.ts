import { NextResponse } from 'next/server';
import { enTetesServeurAmont, urlApiServeur } from '@/lib/api';

export async function GET() {
  // TCK-894 — appel partagé, mis en cache pour tous : le chemin serveur, sans l'IP ni la langue
  // d'un visiteur, qui entreraient dans la clé du cache de `fetch`.
  const upstream = await fetch(urlApiServeur('/maintenance/status'), {
    headers: { ...(await enTetesServeurAmont({ partage: true })), Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  const body = await upstream.text();
  const headers: HeadersInit = {};
  const cache = upstream.headers.get('cache-control');
  if (cache) headers['Cache-Control'] = cache;

  return new NextResponse(body, { status: upstream.status, headers });
}
