import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif, profilActifEspaceApplicatif } from '@/lib/impersonation';
import { cheminAmont, reponseSegmentInvalide } from '@/lib/segments-amont';
import { relayerVersApi } from '@/lib/relais-api';

async function forward(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const chemin = cheminAmont(segments);
  if (chemin === null) return reponseSegmentInvalide();
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const suffix = chemin !== '' ? `/${chemin}` : '';
  const enTetes: Record<string, string> = {};
  const activeProfileId = profilActifEspaceApplicatif(request.cookies);
  if (activeProfileId) enTetes['X-Active-Profile-Hint'] = activeProfileId;

  return relayerVersApi(request, `/agencies${suffix}${request.nextUrl.search}`, { jeton: token, enTetes });
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
