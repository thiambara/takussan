import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { cheminReserveAuxRouteHandlers } from '@/lib/impersonation';
import { cheminAmont, reponseSegmentInvalide } from '@/lib/segments-amont';
import { NextRequest, NextResponse } from 'next/server';
import { relayerVersApi } from '@/lib/relais-api';

/**
 * TCK-145 — Same-origin proxy for the super-admin namespace. Forwards every
 * request to the backend at `/api/admin/<path>` with the auth bearer pulled
 * from the httpOnly cookie. Lives behind the `/super-admin/*` URL space on
 * the frontend; the backend itself exposes the canonical `/api/admin/*` paths.
 */
async function forward(request: NextRequest, segments: string[]): Promise<NextResponse> {
  const chemin = cheminAmont(segments);
  if (chemin === null) return reponseSegmentInvalide();
  // TCK-600 (ADR-0055 §6) — démarrer et terminer une impersonation passent par les SEULS route
  // handlers de `/api/impersonation/` : relayée ici, la réponse de `start` porterait le jeton
  // jusqu'à la page. 404 sans appeler l'API.
  if (cheminReserveAuxRouteHandlers(chemin)) {
    return NextResponse.json({ code: 'not_found' }, { status: 404 });
  }

  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  // TCK-601 — le corps part en OCTETS (la preuve de réponse du registre des droits est un envoi
  // multipart) ; TCK-893 — le relais commun s'en charge, comme du 204 et des en-têtes de réponse.
  return relayerVersApi(request, `/admin/${chemin}${request.nextUrl.search}`, {
    jeton: token,
    accepteDeLaRequete: true,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function POST(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
export async function DELETE(request: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path ?? []);
}
