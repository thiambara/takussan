'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { CHAMPS_DES_PERSONNES_D_UNE_CARTE, CHAMPS_DU_BIEN_D_UNE_CARTE, type InterventionEnFile } from '@/lib/maintenance/files';
import { CHAMPS_DES_INTERVENTIONS_DU_BAILLEUR, STATUT_DU_DEVIS_A_DECIDER, STATUTS_EN_COURS_DU_BAILLEUR } from '@/lib/maintenance/devis-du-bailleur';
import { CHAMPS_DES_DEMANDES_DU_LOCATAIRE } from '@/lib/maintenance/mes-demandes';
import {
  CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE,
  FACTURES_LUES_POUR_LE_TOTAL,
  STATUTS_A_PERCEVOIR,
  type SemaineDuPrestataire,
} from '@/lib/maintenance/semaine-du-prestataire';
import type { CorpsDuSignalement } from '@/lib/maintenance/signalement';
import { maintenanceKeys } from '@/lib/queries/maintenance';
import type { ApiResponse, PaginatedResponse } from '@/types/api';
import type { ServiceProviderBill } from '@/types/invoice';
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

/** Les devis qui attendent le bailleur : rarement plus d'un ou deux. Au-delà, la liste complète. */
export const DEVIS_DU_BAILLEUR_PAR_PAGE = 10;
/** « En cours sur vos biens » en montre cinq ; au-delà, « Tout voir ». */
export const EN_COURS_DU_BAILLEUR_PAR_PAGE = 5;

const CHAMPS_LUS_PAR_LE_BAILLEUR = {
  maintenance_requests: [...CHAMPS_DES_INTERVENTIONS_DU_BAILLEUR],
  properties: [...CHAMPS_DU_BIEN_D_UNE_CARTE],
  users: [...CHAMPS_DES_PERSONNES_D_UNE_CARTE],
};

export const PARAMETRES_DES_DEVIS_DU_BAILLEUR = {
  fields: CHAMPS_LUS_PAR_LE_BAILLEUR,
  filter: { status: STATUT_DU_DEVIS_A_DECIDER },
  include: ['property', 'requester', 'assignee'],
  sort: '-created_at',
  per_page: DEVIS_DU_BAILLEUR_PAR_PAGE,
};

export const PARAMETRES_DES_EN_COURS_DU_BAILLEUR = {
  fields: CHAMPS_LUS_PAR_LE_BAILLEUR,
  filter: { status: STATUTS_EN_COURS_DU_BAILLEUR },
  include: ['property', 'assignee'],
  sort: '-created_at',
  per_page: EN_COURS_DU_BAILLEUR_PAR_PAGE,
};

/**
 * TCK-2654, lot 3 — `GET /api/maintenance-requests?filter[status]=awaiting_owner` du bailleur (portée
 * `visibleTo` : les demandes de ses biens). Filtré par l'API : un devis en attente n'est jamais perdu
 * sur une deuxième page d'une liste partagée ; `meta.total` donne le compte du sous-titre.
 */
export function useDevisAttendantLeBailleur() {
  return useApiQuery<PaginatedResponse<InterventionEnFile>>(
    [...maintenanceKeys.all, 'bailleur', 'devis'],
    '/api/maintenance-requests',
    { params: PARAMETRES_DES_DEVIS_DU_BAILLEUR },
  );
}

/** TCK-2654, lot 3 — « En cours sur vos biens » : les statuts de `STATUTS_EN_COURS_DU_BAILLEUR`, filtrés par l'API. */
export function useEnCoursDuBailleur() {
  return useApiQuery<PaginatedResponse<InterventionEnFile>>(
    [...maintenanceKeys.all, 'bailleur', 'en-cours'],
    '/api/maintenance-requests',
    { params: PARAMETRES_DES_EN_COURS_DU_BAILLEUR },
  );
}

const CHAMPS_LUS_PAR_LE_PRESTATAIRE = {
  maintenance_requests: [...CHAMPS_DES_INTERVENTIONS_DU_PRESTATAIRE],
  properties: [...CHAMPS_DU_BIEN_D_UNE_CARTE],
};

/** TCK-2654, lot 4 — « À accepter » : la file `a_accepter` de l'API (assignée à l'appelant, pas encore acceptée, ni rendue ni close). */
export const PARAMETRES_DES_INTERVENTIONS_A_ACCEPTER = {
  fields: CHAMPS_LUS_PAR_LE_PRESTATAIRE,
  filter: { file: 'a_accepter' },
  include: ['property'],
  sort: '-created_at',
  per_page: 20,
};

export function useInterventionsAAccepter() {
  return useApiQuery<PaginatedResponse<InterventionEnFile>>(
    [...maintenanceKeys.all, 'prestataire', 'a-accepter'],
    '/api/maintenance-requests',
    { params: PARAMETRES_DES_INTERVENTIONS_A_ACCEPTER },
  );
}

/**
 * TCK-2654, lot 4 — la semaine du prestataire : SES interventions (`filter[assigned_to]`) dont le
 * créneau tombe entre le lundi et le dimanche, à Dakar, bornes incluses (`filter[scheduled_from|to]`,
 * TCK-2623). 100 lignes, le plafond de l'API : une semaine n'en porte pas tant.
 */
export function parametresDeLaSemaine(moi: number, semaine: SemaineDuPrestataire) {
  return {
    fields: CHAMPS_LUS_PAR_LE_PRESTATAIRE,
    filter: { assigned_to: moi, scheduled_from: semaine.jours[0], scheduled_to: semaine.jours[6] },
    include: ['property'],
    sort: 'scheduled_at',
    per_page: FACTURES_LUES_POUR_LE_TOTAL,
  };
}

export function useSemaineDuPrestataire(moi: number | undefined, semaine: SemaineDuPrestataire) {
  return useApiQuery<PaginatedResponse<InterventionEnFile>>(
    [...maintenanceKeys.all, 'prestataire', 'semaine', moi ?? 0, semaine.jours[0]],
    '/api/maintenance-requests',
    { params: parametresDeLaSemaine(moi ?? 0, semaine), enabled: moi !== undefined },
  );
}

const CHAMPS_D_UNE_FACTURE = ['id', 'maintenance_request_id', 'property_id', 'reference_number', 'amount', 'currency', 'status', 'validated_at', 'created_at'];

/** Les factures montrées en cartes ; « Toutes » mène au registre complet au-delà. */
export const FACTURES_DU_PRESTATAIRE_PAR_PAGE = 5;

/** TCK-2654, lot 4 — « Mes factures » : les siennes, l'intervention et le bien nommés (`include`). */
export function useFacturesDuPrestataire(moi: number | undefined) {
  return useApiQuery<PaginatedResponse<ServiceProviderBill>>(
    ['service-provider-bills', 'prestataire', moi ?? 0, 'cartes'],
    '/api/service-provider-bills',
    {
      params: {
        fields: { service_provider_bills: CHAMPS_D_UNE_FACTURE, maintenance_requests: ['id', 'title'], properties: ['id', 'title'] },
        filter: { provider_id: moi ?? 0 },
        include: ['maintenanceRequest', 'property'],
        sort: '-created_at',
        per_page: FACTURES_DU_PRESTATAIRE_PAR_PAGE,
      },
      enabled: moi !== undefined,
    },
  );
}

/**
 * TCK-2654, lot 4 — « À percevoir » : les factures `STATUTS_A_PERCEVOIR`, FILTRÉES par l'API, jusqu'à
 * son plafond de 100 ; `aPercevoir()` refuse un total quand `meta.total` dépasse ce qui a été lu.
 */
export function useFacturesAPercevoir(moi: number | undefined) {
  return useApiQuery<PaginatedResponse<ServiceProviderBill>>(
    ['service-provider-bills', 'prestataire', moi ?? 0, 'a-percevoir'],
    '/api/service-provider-bills',
    {
      params: {
        fields: { service_provider_bills: ['id', 'amount', 'status'] },
        filter: { provider_id: moi ?? 0, status: STATUTS_A_PERCEVOIR },
        per_page: FACTURES_LUES_POUR_LE_TOTAL,
      },
      enabled: moi !== undefined,
    },
  );
}
