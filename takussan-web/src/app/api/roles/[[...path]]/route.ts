import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { ACTIVE_PROFILE_COOKIE } from '@/lib/profiles';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

/**
 * TCK-135 — Same-origin proxy for the role editor. Forwards
 * `/api/roles[/...]` 1:1 to the backend, attaching the auth bearer and
 * the `X-Active-Profile-Hint` header so the active-profile-resolved
 * team_id gates writes correctly. Hint is soft: a stale cookie value is
 * silently ignored upstream.
 */
async function forward(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });

  const suffix = segments.length > 0 ? `/${segments.join('/')}` : '';
  const url = `${API_URL}/api/roles${suffix}${request.nextUrl.search}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const activeProfileId = request.cookies.get(ACTIVE_PROFILE_COOKIE)?.value;
  if (activeProfileId) headers['X-Active-Profile-Hint'] = activeProfileId;
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const init: RequestInit = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.text();
  }

  const upstream = await fetch(url, init);
  const responseHeaders: HeadersInit = {};
  const upstreamCt = upstream.headers.get('content-type');
  if (upstreamCt) responseHeaders['Content-Type'] = upstreamCt;

  // Status codes 204 / 205 / 304 forbid a body — passing one to
  // NextResponse throws. Laravel's `$this->json(null, 204)` still
  // emits `null` as the body, so we must drop it here.
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status, headers: responseHeaders });
  }

  return new NextResponse(await upstream.text(), { status: upstream.status, headers: responseHeaders });
}

type Ctx = { params: Promise<{ path?: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
