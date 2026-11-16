/**
 * TCK-2848 — de l'URL d'une fiche de `/app` au couple `type`/`id` de `GET /api/me/locate` (TCK-2847,
 * ADR-0116) : la page introuvable demande si la fiche est lisible dans un AUTRE espace du compte.
 *
 * Les mots sont la liste fermée de l'API (`OuEstLaFiche::TYPES`) ; une section sans mot (documents,
 * états des lieux) ne demande rien. L'identifiant suit la règle de `LocateRequest` (entier positif,
 * 18 chiffres au plus) : une URL qui ne la suit pas ne part pas — un 422 ne nommerait rien et entamerait
 * la limite de débit (`throttle:30,1`).
 */
export const TYPE_DE_LA_SECTION = {
  properties: 'bien',
  customers: 'client',
  leases: 'bail',
  maintenance: 'intervention',
  visits: 'visite',
  bookings: 'reservation',
  owners: 'bailleur',
} as const;

export type TypeDeFiche = (typeof TYPE_DE_LA_SECTION)[keyof typeof TYPE_DE_LA_SECTION];

const IDENTIFIANT = /^[1-9][0-9]{0,17}$/;

export function ficheDeLUrl(pathname: string | null | undefined): { readonly type: TypeDeFiche; readonly id: string } | null {
  const [espace, section, id] = (pathname ?? '').split('/').filter(Boolean);
  if (espace !== 'app' || !section || !id || !IDENTIFIANT.test(id)) return null;
  if (!Object.hasOwn(TYPE_DE_LA_SECTION, section)) return null;
  return { type: TYPE_DE_LA_SECTION[section as keyof typeof TYPE_DE_LA_SECTION], id };
}
