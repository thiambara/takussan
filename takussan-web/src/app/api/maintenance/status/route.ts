import { NextResponse } from 'next/server';
import { origineApi } from '@/lib/config-publique';

export async function GET() {
  const upstream = await fetch(`${origineApi()}/api/maintenance/status`, {
    headers: { Accept: 'application/json' },
    next: { revalidate: 60 },
  });
  const body = await upstream.text();
  const headers: HeadersInit = {};
  const cache = upstream.headers.get('cache-control');
  if (cache) headers['Cache-Control'] = cache;

  return new NextResponse(body, { status: upstream.status, headers });
}
