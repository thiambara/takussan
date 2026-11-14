'use client';

/**
 * TCK-2653 — les lectures des files d'interventions de l'agence (TCK-2652 côté API) :
 *
 *  · `GET /api/maintenance-requests/summary` — les comptes des pastilles et des colonnes, en UN
 *    appel (AC2). Les autres filtres s'y appliquent ; jamais `filter[file]`.
 *  · `GET /api/maintenance-requests?filter[file]=…` — les cartes d'une file : la plus pressante
 *    d'abord, puis la plus ancienne (`sort=-priority,created_at`). Le tri doit être EXPLICITE : le
 *    tri par défaut de l'API (`defaultSorts('-priority', …)`) ne passe pas par `MaintenancePrioritySort`
 *    et range la colonne en texte (normal > low > high > urgent), mesuré sur la démo le 2026-11-13.
 *
 * Les clés vivent sous `maintenanceKeys.all` : toute écriture du domaine (assignation, statut,
 * devis) les invalide avec le reste.
 */

import { useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { nomCompletDe } from '@/lib/identite';
import { maintenanceKeys, type MaintenanceListResponse } from '@/lib/queries/maintenance';
import {
  CHAMPS_D_UNE_CARTE,
  CHAMPS_DES_PERSONNES_D_UNE_CARTE,
  CHAMPS_DU_BIEN_D_UNE_CARTE,
  type FileDIntervention,
  type InterventionEnFile,
  type ResumeDesFiles,
} from '@/lib/maintenance/files';
import type { SpatieQueryParams } from '@/types/api';
import type { MaintenanceCategory, MaintenancePriority } from '@/types/maintenance';

/** Les filtres communs aux files et à leurs comptes. */
export interface FiltresDesFiles {
  readonly search?: string | null;
  readonly priority?: MaintenancePriority | null;
  readonly category?: MaintenanceCategory | null;
  readonly propertyId?: number | null;
}

export const maintenanceFilesKeys = {
  resume: (f: FiltresDesFiles) => [...maintenanceKeys.all, 'files', 'resume', f] as const,
  file: (file: FileDIntervention, f: FiltresDesFiles, parPage: number, page: number) =>
    [...maintenanceKeys.all, 'files', file, f, parPage, page] as const,
};

function filtres(f: FiltresDesFiles): Record<string, string | number> {
  const filter: Record<string, string | number> = {};
  if (f.search) filter.search = f.search;
  if (f.priority) filter.priority = f.priority;
  if (f.category) filter.category = f.category;
  if (f.propertyId) filter.property_id = f.propertyId;
  return filter;
}

/** Une file se lit la plus pressante d'abord, puis la plus ancienne : c'est elle qui attend le plus. */
export const TRI_D_UNE_FILE = '-priority,created_at';

/** Les paramètres de `GET /api/maintenance-requests/summary` : les filtres, rien d'autre. */
export function parametresDuResume(f: FiltresDesFiles): SpatieQueryParams {
  const filter = filtres(f);
  return Object.keys(filter).length ? { filter } : {};
}

/** Les paramètres d'une file : ses champs, ses inclusions, les filtres et `filter[file]`. */
export function parametresDUneFile(file: FileDIntervention, f: FiltresDesFiles, parPage: number, page = 1): SpatieQueryParams {
  return {
    fields: {
      maintenance_requests: [...CHAMPS_D_UNE_CARTE],
      properties: [...CHAMPS_DU_BIEN_D_UNE_CARTE],
      users: [...CHAMPS_DES_PERSONNES_D_UNE_CARTE],
    },
    filter: { ...filtres(f), file },
    include: ['property', 'requester', 'assignee'],
    sort: TRI_D_UNE_FILE,
    per_page: parPage,
    ...(page > 1 ? { page } : {}),
  };
}

export function useResumeDesFiles(f: FiltresDesFiles) {
  return useApiQuery<{ readonly data: ResumeDesFiles }>(maintenanceFilesKeys.resume(f), '/api/maintenance-requests/summary', {
    params: parametresDuResume(f),
  });
}

export type ReponseDUneFile = Omit<MaintenanceListResponse, 'data'> & { readonly data: InterventionEnFile[] };

export function useFileDInterventions(file: FileDIntervention, f: FiltresDesFiles, parPage: number, page = 1) {
  return useApiQuery<ReponseDUneFile>(maintenanceFilesKeys.file(file, f, parPage, page), '/api/maintenance-requests', {
    params: parametresDUneFile(file, f, parPage, page),
  });
}

/* ───────────────────────────── la fiche : suggestions et carnet ───────────────────────────── */

/** `GET /api/maintenance-requests/{id}/suggested-providers` (TCK-2652) : au plus trois, déjà classés. */
export interface PrestataireSuggere {
  readonly id: number;
  readonly user_id: number | null;
  readonly name: string | null;
  readonly phone: string | null;
  readonly matching_trade: string;
  readonly matching_zone: string | null;
  readonly service_areas: readonly string[];
  readonly average_rating: number | null;
  readonly reviews_count: number;
  readonly completed_interventions_count: number;
}

export function useSuggestionsDePrestataires(id: number, enabled: boolean) {
  return useApiQuery<{ readonly data: PrestataireSuggere[] }>([...maintenanceKeys.detail(id), 'suggestions'], cheminApi`/api/maintenance-requests/${id}/suggested-providers`, { enabled });
}

/**
 * Une ligne du carnet de l'agence (`GET /api/agencies/{agency}/service-providers`) : `phone` est
 * celui du compte, sinon celui de l'invitation (TCK-2652), servi même sous `fields[]`.
 */
export interface LigneDuCarnet {
  readonly id: number;
  readonly user_id: number | null;
  readonly status: string;
  readonly specialties: readonly string[] | null;
  readonly service_areas: readonly string[] | null;
  readonly metadata: { readonly first_name?: string; readonly last_name?: string; readonly email?: string; readonly phone?: string | null } | null;
  readonly phone?: string | null;
  readonly average_rating?: number | null;
  readonly reviews_count?: number;
  readonly completed_interventions_count?: number;
  readonly pending_invitation_id?: number | null;
  readonly user?: { readonly id: number; readonly first_name: string | null; readonly last_name: string | null; readonly email?: string | null } | null;
}

export const CHAMPS_DU_CARNET = ['id', 'user_id', 'status', 'specialties', 'service_areas', 'metadata', 'created_at'] as const;

/**
 * Le carnet ACTIF de l'agence, sans filtre de métier : « Voir tout le carnet » et le téléphone du
 * prestataire à relancer. Le métier ne filtre pas ici : la plupart des fiches de la démo n'en
 * déclarent aucun (`specialties: null`), et un carnet filtré les cacherait toutes.
 */
export function useCarnetActif(agencyId: number | null) {
  return useApiQuery<{ readonly data: LigneDuCarnet[] }>(['service-providers', 'carnet-actif', agencyId ?? 0], cheminApi`/api/agencies/${agencyId ?? 0}/service-providers`, {
    params: { fields: { service_provider_profiles: [...CHAMPS_DU_CARNET] }, include: ['user'], filter: { status: 'active' }, per_page: 100, sort: '-created_at' },
    enabled: agencyId !== null && agencyId > 0,
  });
}

/** Le nom d'une ligne du carnet : celui du compte, sinon celui de l'invitation (TCK-2136). */
export function nomDuCarnet(l: Pick<LigneDuCarnet, 'user' | 'metadata' | 'user_id'>): string {
  return nomCompletDe(l.user) ?? nomCompletDe(l.metadata) ?? (l.user?.email || l.metadata?.email || String(l.user_id ?? ''));
}
