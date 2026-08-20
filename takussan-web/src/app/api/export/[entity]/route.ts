import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002').replace(/\/api$/, '');

const ALLOWED_ENTITIES = new Set(['payments', 'leases', 'customers', 'properties']);
const FORWARD_PARAMS = ['format', 'from', 'to', 'limit'] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entity: string }> },
): Promise<NextResponse> {
  const { entity } = await params;

  if (!ALLOWED_ENTITIES.has(entity)) {
    console.error('[BFF] export : entité inconnue', entity);
    return NextResponse.json({ code: 'unknown_entity' }, { status: 404 });
  }

  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });
  }

  const upstream = new URL(`${API_URL}/api/export/${entity}`);
  for (const key of FORWARD_PARAMS) {
    const v = request.nextUrl.searchParams.get(key);
    if (v !== null && v !== '') upstream.searchParams.set(key, v);
  }

  const res = await fetch(upstream, {
    headers: { Authorization: `Bearer ${token}`, Accept: '*/*' },
  });

  const headers = new Headers();
  for (const h of ['content-type', 'content-disposition', 'content-length', 'cache-control']) {
    const v = res.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new NextResponse(res.body, { status: res.status, headers });
}
