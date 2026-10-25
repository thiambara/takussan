/**
 * TCK-2330 (P222.05) — ce qu'un corps de requête vers l'API peut porter, jugé au front.
 *
 * Le proxy de l'image de l'API refuse en 413, sans corps JSON, toute requête de plus de
 * 26 214 400 octets (25 Mio : `request_body` et `@trop_gros` de `takussan-api/docker/Caddyfile`).
 * Les règles de l'API admettent davantage par lot : cinq pièces de 5 Mo au devis (la borne même),
 * dix de 10 Mo à la caution. Les pièces d'un envoi se jugent donc AUSSI à leur somme, sous la borne
 * moins une marge pour les autres champs et l'enveloppe multipart.
 */
const MIO = 1024 * 1024;

export const BORNE_DU_CORPS_OCTETS = 25 * MIO;
const MARGE_DU_CORPS_OCTETS = MIO;
export const PIECES_PAR_ENVOI_MAX_OCTETS = BORNE_DU_CORPS_OCTETS - MARGE_DU_CORPS_OCTETS;
/** La même somme, en Mo, pour le message. */
export const PIECES_PAR_ENVOI_MAX_MO = PIECES_PAR_ENVOI_MAX_OCTETS / MIO;

export function piecesDepassentLeCorps(fichiers: readonly File[]): boolean {
  return fichiers.reduce((somme, fichier) => somme + fichier.size, 0) > PIECES_PAR_ENVOI_MAX_OCTETS;
}
