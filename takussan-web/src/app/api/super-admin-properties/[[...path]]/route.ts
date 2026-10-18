import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { NextRequest, NextResponse } from 'next/server';
import { cheminAmont, reponseSegmentInvalide } from '@/lib/segments-amont';
import { relayerVersApi } from '@/lib/relais-api';

/**
 * TCK-132 — Same-origin proxy for the super-admin properties view. Forwards
 * to `/api/properties[/...]` (super_admin sees all agencies via `Gate::before`,
 * see PropertyController). Lives outside `/api/super-admin/*` because the
 * upstream route is the shared CRUD, not the strict admin namespace
 * (TCK-144 kept `/api/properties` shared on purpose).
 */
async function forward(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const chemin = cheminAmont(segments);
  if (chemin === null) return reponseSegmentInvalide();
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const suffix = chemin !== '' ? `/${chemin}` : '';
  return relayerVersApi(request, `/properties${suffix}${request.nextUrl.search}`, { jeton: token });
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
