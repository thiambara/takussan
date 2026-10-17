import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif } from '@/lib/impersonation';
import { origineApi } from '@/lib/config-publique';

export async function GET(request: NextRequest) {
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ data: {} });
  const upstream = await fetch(`${origineApi()}/api/feature-flags/me`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await upstream.text();
  const headers: HeadersInit = {};
  const cache = upstream.headers.get('cache-control');
  if (cache) headers['Cache-Control'] = cache;

  return new NextResponse(body, { status: upstream.status, headers });
}
