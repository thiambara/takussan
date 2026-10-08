import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { cheminReserveAuxRouteHandlers } from '@/lib/impersonation';
import { cheminAmont, reponseSegmentInvalide } from '@/lib/segments-amont';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL
  ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
  : 'http://localhost:8002';

/**
 * TCK-145 — Same-origin proxy for the super-admin namespace. Forwards every
 * request to the backend at `/api/admin/<path>` with the auth bearer pulled
 * from the httpOnly cookie. Lives behind the `/super-admin/*` URL space on
 * the frontend so the agency_admin dashboard at `/admin/*` (TCK-131) keeps
 * its routes; the backend itself exposes the canonical `/api/admin/*` paths.
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

  const search = request.nextUrl.search;
  const url = `${API_URL}/api/admin/${chemin}${search}`;

  const headers: Record<string, string> = {
    Accept: request.headers.get('accept') ?? 'application/json',
    Authorization: `Bearer ${token}`,
  };
  const contentType = request.headers.get('content-type');
  if (contentType) headers['Content-Type'] = contentType;

  const init: RequestInit = {
    method: request.method,
    headers,
  };
  if (!['GET', 'HEAD'].includes(request.method)) {
    // TCK-601 — les OCTETS, pas `text()` : la preuve de réponse du registre des droits est le
    // premier envoi multipart de la console, et `text()` décode le corps en UTF-8 — un PDF ou une
    // photo en ressortait corrompu (chaque séquence invalide remplacée par U+FFFD), sous la même
    // limite `boundary` que l'en-tête `Content-Type` recopié plus haut. Sans effet sur le JSON.
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(url, init);
  const data = await upstream.arrayBuffer();
  const responseHeaders: HeadersInit = {};
  for (const name of ['content-type', 'content-disposition', 'cache-control']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders[name] = value;
  }

  return new NextResponse(data, { status: upstream.status, headers: responseHeaders });
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
