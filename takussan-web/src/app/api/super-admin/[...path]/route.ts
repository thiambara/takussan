import { AUTH_COOKIE_NAME } from '@/lib/constants';
import { cheminReserveAuxRouteHandlers } from '@/lib/impersonation';
import { cheminAmont, reponseSegmentInvalide } from '@/lib/segments-amont';
import { NextRequest, NextResponse } from 'next/server';
import { DELAI_RELAIS_FICHIER_MS, relayerVersApi } from '@/lib/relais-api';

/**
 * TCK-2389 — « Publier pour lui » copie chaque photo de la réserve et encode sa vignette DANS sa transaction : quelques
 * annonces garnies dépassent les 30 s du relais, dont la réponse se perdrait alors que l'API commite. Cette route seule
 * attend jusqu'au délai des fichiers (90 s, sous les 100 s de Cloudflare). La vraie borne est celle de l'API :
 * `max_execution_time` = 60 s en temps d'horloge (image ZTS) — au-delà PHP meurt sans rien défaire des fichiers écrits ;
 * `radar.publish.max_photos` borne donc le travail avant la transaction, et un envoi encore en cours se rejoue côté écran.
 * TCK-2394 — la publication sous mandat (`publish-mandate`) fait le même travail : même délai.
 */
const PUBLICATION_DU_RADAR = /^radar\/advertisers\/\d+\/publish(-mandate)?$/;

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
  // TCK-2389 (ADR-0072) — une écriture idempotente de la console (« Publier pour lui ») pose `Idempotency-Key` : sans ce
  // relais, la clé s'arrêterait ici et l'API ne rejouerait rien. Le relais ne transmet que ce qu'il nomme.
  const enTetes: Record<string, string> = {};
  const cleIdempotence = request.headers.get('idempotency-key');
  if (cleIdempotence) enTetes['Idempotency-Key'] = cleIdempotence;

  return relayerVersApi(request, `/admin/${chemin}${request.nextUrl.search}`, {
    jeton: token,
    enTetes,
    accepteDeLaRequete: true,
    ...(request.method === 'POST' && PUBLICATION_DU_RADAR.test(chemin) ? { delaiMs: DELAI_RELAIS_FICHIER_MS } : {}),
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
