'use client';

/**
 * TCK-2653 — les lectures des files d'interventions de l'agence (TCK-2652 côté API) :
 *
 *  · `GET /api/maintenance-requests/summary` — les comptes des pastilles et des colonnes, en UN
 *    appel (AC2). Les autres filtres s'y appliquent ; jamais `filter[file]`.
 *  · `GET /api/maintenance-requests?filter[file]=…` — les cartes d'une file, au tri par défaut de
 *    l'API (`-priority`, `-created_at`).
 *
 * Les clés vivent sous `maintenanceKeys.all` : toute écriture du domaine (assignation, statut,
 * devis) les invalide avec le reste.
 */

import { useApiQuery } from '@/hooks/useApiQuery';
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
