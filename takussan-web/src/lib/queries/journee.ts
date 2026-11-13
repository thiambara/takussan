'use client';

import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { cheminApi } from '@/lib/chemin-api';
import { CONTACT_LEAD_FIELDS, filtreSpatieDesDemandes, type ContactLead } from '@/lib/queries/contact-leads';
import type { AgentTask } from '@/types/agent-crm';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2596 — les lectures de « Ma journée » qu'aucun module ne portait. Les autres viennent de leur
 * module : visites du jour et à clore (`useVisitesDeLaVue`), semaine (`useCalendar`).
 *
 * Les clés vivent SOUS celles des listes qu'elles recoupent (`['agent-crm', 'tasks']`,
 * `['contact-leads']`, `['customers']`) : cocher une tâche dans « Tâches » relit la journée, et
 * inversement.
 */
export const journeeQueryKeys = {
  taches: () => ['agent-crm', 'tasks', 'journee'] as const,
  demandes: (avant: string) => ['contact-leads', 'journee', avant] as const,
  relances: () => ['customers', 'journee', 'relances'] as const,
};

/** Les colonnes d'une tâche de la journée. */
export const TACHE_DE_LA_JOURNEE_FIELDS = ['id', 'title', 'status', 'priority', 'due_at', 'taskable_id', 'taskable_type'];

/**
 * Mes tâches en retard et du jour (`filter[due]=overdue,today`, une liste : TCK-2595), assignées à
 * moi dans l'agence active (`filter[assigned_to]=me`). Les tâches faites du jour restent : cocher ne
 * fait pas disparaître la ligne.
 */
export function useTachesDeLaJournee() {
  return useApiQuery<PaginatedResponse<AgentTask>>(journeeQueryKeys.taches(), '/api/tasks', {
    params: {
      fields: { tasks: TACHE_DE_LA_JOURNEE_FIELDS },
      filter: { assigned_to: 'me', due: 'overdue,today' },
      sort: ['due_at'],
      page: 1,
      per_page: 50,
    },
    staleTime: 30_000,
  });
}

/**
 * Les demandes qui m'attendent depuis plus de 24 h (TCK-2583) : à moi, non traitées, reçues avant
 * `avant`. Les plus anciennes d'abord ; cinq suffisent à l'écran, le compte vient de `meta.total`.
 */
export function useDemandesQuiAttendent(avant: string) {
  return useApiQuery<PaginatedResponse<ContactLead>>(journeeQueryKeys.demandes(avant), '/api/contact-leads', {
    params: {
      fields: { property_contact_leads: CONTACT_LEAD_FIELDS, properties: ['id', 'title', 'slug'] },
      filter: { ...filtreSpatieDesDemandes('mine'), created_at_max: avant },
      include: ['property'],
      sort: ['created_at'],
      page: 1,
      per_page: 5,
    },
    staleTime: 30_000,
  });
}

/** Le compte de mes clients à relancer (TCK-2588) : `meta.total` d'une lecture d'une ligne. */
export function useRelancesACompter() {
  return useApiQuery<PaginatedResponse<{ id: number }>>(journeeQueryKeys.relances(), '/api/customers', {
    params: { fields: { customers: ['id'] }, filter: { follow_up: '1', referent: 'me' }, page: 1, per_page: 1 },
    staleTime: 60_000,
  });
}

const INVALIDER = { invalidate: [['agent-crm', 'tasks'], ['calendar']] };

/** Cocher ou décocher une tâche (`PATCH /api/tasks/{id}`). */
export function useCocherTache() {
  return useApiMutation<unknown, { id: number; faite: boolean }>(
    { path: ({ id }) => cheminApi`/api/tasks/${id}`, method: 'PATCH', body: ({ faite }) => ({ status: faite ? 'done' : 'open' }) },
    INVALIDER,
  );
}

/** Reporter une tâche : sa nouvelle échéance (`due_at`, un instant UTC). */
export function useReporterTache() {
  return useApiMutation<unknown, { id: number; echeance: string }>(
    { path: ({ id }) => cheminApi`/api/tasks/${id}`, method: 'PATCH', body: ({ echeance }) => ({ due_at: echeance }) },
    INVALIDER,
  );
}
