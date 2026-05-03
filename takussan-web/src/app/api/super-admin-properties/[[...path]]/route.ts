import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

/**
 * TCK-132 — Same-origin proxy for the super-admin properties view. Forwards
 * to `/api/properties[/...]` (super_admin sees all agencies via `Gate::before`,
 * see PropertyController). Lives outside `/api/super-admin/*` because the
 * upstream route is the shared CRUD, not the strict admin namespace
 * (TCK-144 kept `/api/properties` shared on purpose).
 */
async function forward(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ message: 'Unauthenticated.' }, { status: 401 });

  const suffix = segments.length > 0 ? `/${segments.join('/')}` : '';
  const url = `${API_URL}/api/properties${suffix}${request.nextUrl.search}`;

  const headers: Record<string, string> = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const init: RequestInit = { method: request.method, headers };
  if (!['GET', 'HEAD'].includes(request.method)) {
    init.body = await request.text();
  }

  const upstream = await fetch(url, init);
  const data = await upstream.text();
  const responseHeaders: HeadersInit = {};
  const upstreamCt = upstream.headers.get('content-type');
  if (upstreamCt) responseHeaders['Content-Type'] = upstreamCt;

  return new NextResponse(data, { status: upstream.status, headers: responseHeaders });
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
