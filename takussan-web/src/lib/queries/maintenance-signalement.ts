'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { CHAMPS_DES_PERSONNES_D_UNE_CARTE, CHAMPS_DU_BIEN_D_UNE_CARTE, type InterventionEnFile } from '@/lib/maintenance/files';
import { CHAMPS_DES_DEMANDES_DU_LOCATAIRE } from '@/lib/maintenance/mes-demandes';
import type { CorpsDuSignalement } from '@/lib/maintenance/signalement';
import { maintenanceKeys } from '@/lib/queries/maintenance';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { MaintenanceRequest } from '@/types/maintenance';

/**
 * TCK-2654 — `POST /api/maintenance-requests` depuis le signalement du locataire : le corps peut ne
 * pas porter de `description` (TCK-2652), ce que le type du formulaire du personnel
 * (`MaintenanceCreateInput`, description exigée) n'admet pas. Même route, même idempotence
 * (ADR-0072), même invalidation que `useCreateMaintenanceRequest`.
 */
export function useSignalerUnProbleme() {
  return useApiMutation<ApiResponse<MaintenanceRequest>, CorpsDuSignalement>(
    { path: '/api/maintenance-requests', method: 'POST' },
    { idempotence: true, invalidate: [maintenanceKeys.all] },
  );
}

/** Au-delà, « Tout voir » mène à la liste complète (`?status=`). Un locataire en a d'ordinaire quelques-unes. */
export const DEMANDES_DU_LOCATAIRE_PAR_PAGE = 50;

export const PARAMETRES_DES_DEMANDES_DU_LOCATAIRE = {
  fields: {
    maintenance_requests: [...CHAMPS_DES_DEMANDES_DU_LOCATAIRE],
    properties: [...CHAMPS_DU_BIEN_D_UNE_CARTE],
    users: [...CHAMPS_DES_PERSONNES_D_UNE_CARTE],
  },
  include: ['property', 'assignee'],
  sort: '-created_at',
  per_page: DEMANDES_DU_LOCATAIRE_PAR_PAGE,
};

/**
 * TCK-2654, lot 2 — `GET /api/maintenance-requests` du locataire (portée `visibleTo` de l'API) : ses
 * demandes, le bien et l'artisan, sans aucune colonne de coût (`CHAMPS_DES_DEMANDES_DU_LOCATAIRE`).
 */
export function useDemandesDuLocataire() {
  return useApiQuery<PaginatedResponse<InterventionEnFile>>(
    [...maintenanceKeys.all, 'locataire', 'demandes'],
    '/api/maintenance-requests',
    { params: PARAMETRES_DES_DEMANDES_DU_LOCATAIRE },
  );
}
