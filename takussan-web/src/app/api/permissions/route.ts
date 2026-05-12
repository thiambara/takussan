import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

/**
 * TCK-135 — Same-origin proxy for the permissions catalogue. Read-only,
 * gated upstream by `roles.manage_in_agency`.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const activeProfileId = request.cookies.get(ACTIVE_PROFILE_COOKIE)?.value;
  if (activeProfileId) headers['X-Active-Profile-Hint'] = activeProfileId;

  const upstream = await fetch(`${API_URL}/api/permissions${request.nextUrl.search}`, {
    method: 'GET',
    headers,
  });
  const data = await upstream.text();
  const responseHeaders: HeadersInit = {};
  const upstreamCt = upstream.headers.get('content-type');
  if (upstreamCt) responseHeaders['Content-Type'] = upstreamCt;

  return new NextResponse(data, { status: upstream.status, headers: responseHeaders });
}
