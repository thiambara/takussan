/**
 * TCK-1024 (P63.03) — durée de vie des URL signées que l'API émet, vue du front.
 *
 * Miroirs des constantes de l'API (aucune n'est transmise dans la réponse sous une forme que le
 * cache saurait lire) :
 * - `DUREE_URL_SIGNEE_KYC_MS` : `KycDossierResource` signe `kyc.documents.show` pour 15 min ;
 * - `DUREE_URL_SIGNEE_MEDIA_MS` : `PrivateMediaAccess::SIGNED_ROUTE_TTL_MINUTES`, 30 min, pour
 *   `media.private.show` (documents, versions, pièces de maintenance).
 */
export const DUREE_URL_SIGNEE_KYC_MS = 15 * 60 * 1000;
export const DUREE_URL_SIGNEE_MEDIA_MS = 30 * 60 * 1000;

/**
 * Options TanStack Query d'une requête dont la réponse porte une URL signée de `dureeMs`.
 *
 * Le client par défaut tient une donnée fraîche 5 min puis ne refetche qu'au montage, au retour du
 * focus ou à la reconnexion (`query-client.ts`) : un onglet resté au premier plan gardait des liens
 * expirés. Rafraîchir à mi-durée laisse au lien affiché au moins la moitié de sa vie ; la donnée
 * périmée au même moment fait refetcher un onglet qui revient au premier plan (l'intervalle ne tourne
 * pas en arrière-plan).
 */
export function rafraichirAvantExpiration(dureeMs: number): { staleTime: number; refetchInterval: number } {
  const delai = Math.floor(dureeMs / 2);
  return { staleTime: delai, refetchInterval: delai };
}
