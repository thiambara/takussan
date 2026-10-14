/**
 * TCK-633 — le référentiel géographique tel que le rendent `/api/public/geo/*` (ADR-0062).
 * Les listes arrivent dans l'enveloppe `{ data: [...] }` du contrôleur.
 */
export interface GeoRegion {
  readonly id: number;
  readonly name: string;
  readonly slug: string;
}

export interface GeoCity {
  readonly id: number;
  readonly region_id: number;
  readonly name: string;
  readonly slug: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
}

/** `pending` : une proposition, servie à son seul auteur tant qu'elle n'est pas vérifiée. */
export type GeoNeighborhoodStatus = 'approved' | 'pending' | 'rejected';

export interface GeoNeighborhood {
  readonly id: number;
  readonly city_id: number;
  readonly name: string;
  readonly slug: string;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly status: GeoNeighborhoodStatus;
}

/** `POST /api/geo/resolve-link` — un lien court suivi côté serveur (E-13). */
export interface ResolutionDeLien {
  readonly latitude: number;
  readonly longitude: number;
  readonly outside_senegal: boolean;
}
