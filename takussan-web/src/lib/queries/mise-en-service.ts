import { apiRequest } from '@/lib/api';
import { cheminApi } from '@/lib/chemin-api';

/**
 * TCK-1830 (P136.05) — la mise en service d'une agence (`GET /api/agencies/{id}/setup-status`) :
 * la clé et le chemin que lisent la carte `MiseEnService` (navigateur) et le tableau de bord
 * d'agence (serveur, qui l'amorce pour le premier rendu). Sans directive : lisible des deux côtés.
 */
export interface EtapeMiseEnService {
  readonly key: string;
  readonly done: boolean;
}

export interface SetupStatusResponse {
  readonly data: { readonly complete: boolean; readonly steps: readonly EtapeMiseEnService[] };
}

export const cleMiseEnService = (agencyId: number | null) => ['agencies', agencyId, 'setup-status'] as const;

export const cheminMiseEnService = (agencyId: number) => cheminApi`/api/agencies/${agencyId}/setup-status`;

export function fetchMiseEnService(token: string, agencyId: number): Promise<SetupStatusResponse> {
  return apiRequest<SetupStatusResponse>(cheminMiseEnService(agencyId), { token });
}
