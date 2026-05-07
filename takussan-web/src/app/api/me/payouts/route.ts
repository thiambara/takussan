import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

/**
 * TCK-223 — agency-side platform payouts. The active-profile header lets the
 * backend resolve which agency the caller is acting for, so an agency_admin
 * who holds multiple profiles still sees the right scope.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const activeProfileId = request.cookies.get(ACTIVE_PROFILE_COOKIE)?.value;
  if (activeProfileId) headers['X-Profile-Id'] = activeProfileId;

  const upstream = await fetch(`${API_URL}/api/me/payouts${request.nextUrl.search}`, { headers });
  return new NextResponse(await upstream.text(), {
    status: upstream.status,
    headers: { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' },
  });
}
