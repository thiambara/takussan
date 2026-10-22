import { NextRequest, NextResponse } from 'next/server';
import { jetonEspaceApplicatif, profilActifEspaceApplicatif } from '@/lib/impersonation';
import { reponseSegmentInvalide, segmentAmont } from '@/lib/segments-amont';
import { relayerVersApi } from '@/lib/relais-api';

/**
 * TCK-1519 (P73.03, TCK-546) — le relais de la pièce KYC, ouverte par un lien du navigateur.
 *
 * `kyc.documents.show` est sous `auth:sanctum` ET signée : une navigation, sans `Authorization`,
 * rendait 401. Ce relais pose le jeton du cookie et le profil actif (comme `agencies`), et
 * transmet la chaîne signée telle quelle. Il ne juge rien : signature, appartenance au dossier et
 * couple (utilisateur, agence) restent ceux de `KycDocumentController`. Voie retenue dans le
 * ticket : elle ne touche aucune autorisation de l'API.
 */
type Ctx = { params: Promise<{ media: string }> };

export async function GET(request: NextRequest, ctx: Ctx): Promise<NextResponse> {
  const media = segmentAmont((await ctx.params).media);
  if (media === null) return reponseSegmentInvalide();
  const token = jetonEspaceApplicatif(request.cookies);
  if (!token) return NextResponse.json({ code: 'unauthenticated' }, { status: 401 });

  const enTetes: Record<string, string> = {};
  const activeProfileId = profilActifEspaceApplicatif(request.cookies);
  if (activeProfileId) enTetes['X-Active-Profile-Hint'] = activeProfileId;

  return relayerVersApi(request, `/kyc/documents/${media}${request.nextUrl.search}`, { jeton: token, enTetes });
}
