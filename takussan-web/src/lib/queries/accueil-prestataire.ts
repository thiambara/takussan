import { useApiQuery } from '@/hooks/useApiQuery';
import { CHAMPS_DU_BIEN_D_UNE_CARTE, type InterventionEnFile } from '@/lib/maintenance/files';
import { CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE } from '@/lib/maintenance/semaine-du-prestataire';
import { maintenanceKeys } from '@/lib/queries/maintenance';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2625 — « À chiffrer » de l'accueil du prestataire : SES demandes (`filter[assigned_to]`) dont le
 * devis est demandé (`filter[status]=quote_requested`), filtrées par l'API. Les colonnes sont celles
 * de « Mes interventions » (TCK-2654) : la carte lit le titre, le bien et l'attente.
 *
 * Sous `maintenanceKeys.all` : un devis soumis depuis la fiche invalide cette file aussi.
 */
export const A_CHIFFRER_PAR_PAGE = 5;

export function parametresAChiffrer(moi: number) {
  return {
    fields: { maintenance_requests: [...CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE], properties: [...CHAMPS_DU_BIEN_D_UNE_CARTE] },
    filter: { assigned_to: moi, status: 'quote_requested' },
    include: ['property'],
    sort: '-created_at',
    per_page: A_CHIFFRER_PAR_PAGE,
  };
}

export function useAChiffrer(moi: number | undefined) {
  return useApiQuery<PaginatedResponse<InterventionEnFile>>(
    [...maintenanceKeys.all, 'prestataire', 'a-chiffrer', moi ?? 0],
    '/api/maintenance-requests',
    { params: parametresAChiffrer(moi ?? 0), enabled: moi !== undefined },
  );
}
