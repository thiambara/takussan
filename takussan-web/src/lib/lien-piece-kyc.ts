/**
 * TCK-1519 (P73.03, TCK-546) — le lien d'une pièce KYC, tel que le navigateur doit l'ouvrir.
 *
 * L'API émet `signed_url` sur son propre hôte, et garde `kyc.documents.show` sous `auth:sanctum`
 * en plus de la signature : une navigation n'y porte aucun Bearer, et la pièce rendait 401. Le
 * lien vise donc le relais du front, `/api/kyc/documents/[media]`, qui pose le jeton du cookie. Le
 * chemin est le même des deux côtés : on garde chemin et requête (la signature, relative depuis
 * TCK-1059, ne dépend pas de l'hôte), et on laisse l'origine.
 *
 * Un lien qui ne vise pas une pièce KYC est rendu tel quel.
 */
const CHEMIN_PIECE_KYC = /^\/api\/kyc\/documents\/\d+$/;

export function lienPieceKyc(signedUrl: string): string {
  let url: URL;
  try {
    url = new URL(signedUrl);
  } catch {
    return signedUrl;
  }
  return CHEMIN_PIECE_KYC.test(url.pathname) ? `${url.pathname}${url.search}` : signedUrl;
}
