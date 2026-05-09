import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

/**
 * Same-origin proxy for the super-admin users search (TCK-145). Forwards to
 * `/api/admin/users` (strict super-admin controller). Lives outside the
 * `/api/super-admin/*` prefix because the upstream is not under the strict
 * super-admin namespace — it's the generic admin user controller.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });

  const search = request.nextUrl.search;
  const upstream = await fetch(`${API_URL}/api/admin/users${search}`, {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const body = await upstream.text();
  const ct = upstream.headers.get('content-type');
  return new NextResponse(body, {
    status: upstream.status,
    headers: ct ? { 'Content-Type': ct } : undefined,
  });
}
