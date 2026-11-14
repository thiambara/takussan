'use client';

import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { useApiMutation } from '@/hooks/useApiQuery';
import { ApiError, apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { fetchAgencyAgents } from '@/lib/queries/agent-crm';
import { filtreDeLaListe, filtreDuCompte, triDeLaListe, type EtatDesTaches } from '@/lib/taches/taches';
import type { AgencyStaffMember, AgentTask, TaskDue } from '@/types/agent-crm';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2596 (lot 2) — les lectures et les gestes de la page « Tâches ». Les clés vivent sous
 * `['agent-crm', 'tasks']` : un geste ici relit « Ma journée » et la fiche client, et inversement.
 */
export const tachesQueryKeys = {
  liste: (etat: EtatDesTaches) => ['agent-crm', 'tasks', 'page', filtreDeLaListe(etat)] as const,
  compte: (filtre: Record<string, string>) => ['agent-crm', 'tasks', 'compte', filtre] as const,
  membres: (agencyId: number) => ['agent-crm', 'agency', agencyId, 'staff', 'taches'] as const,
};

/**
 * Les colonnes d'une ligne : `assigned_to_id` et `created_by_id` portent l'assigné et le créateur
 * (sans elles, l'API les rend nuls et « Supprimer » ne se jugerait plus).
 */
export const TACHE_FIELDS = ['id', 'title', 'status', 'priority', 'due_at', 'taskable_id', 'taskable_type', 'assigned_to_id', 'created_by_id', 'created_at', 'completed_at'];

export const PAR_PAGE = 30;

export interface TacheDeLaPage extends AgentTask {
  readonly creator?: { readonly id: number; readonly name: string } | null;
  readonly created_at?: string | null;
  readonly completed_at?: string | null;
}

/** La liste de la sélection, par pages de 30 (« Voir plus »). */
export function useListeDesTaches(etat: EtatDesTaches) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: tachesQueryKeys.liste(etat),
    queryFn: ({ pageParam, signal }) => {
      const qs = buildQueryString({
        fields: { tasks: TACHE_FIELDS },
        filter: filtreDeLaListe(etat),
        sort: triDeLaListe(etat.selection),
        page: pageParam,
        per_page: PAR_PAGE,
      });
      return apiRequest<PaginatedResponse<TacheDeLaPage>>(cheminApi`/api/tasks${requete(qs)}`, { token: token ?? '', signal });
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
    enabled: !!token,
    staleTime: 30_000,
  });
}

export type CompteDesTaches = TaskDue | 'done';
export const COMPTES: readonly CompteDesTaches[] = ['overdue', 'today', 'upcoming', 'none', 'done'];

/** Les comptes des pastilles : `meta.total` d'une lecture d'une ligne chacun, à la portée de la page. */
export function useComptesDesTaches(etat: EtatDesTaches): Readonly<Partial<Record<CompteDesTaches, number>>> {
  const { token } = useAuth();
  const resultats = useQueries({
    queries: COMPTES.map((c) => {
      const filtre = filtreDuCompte(etat, c);
      return {
        queryKey: tachesQueryKeys.compte(filtre),
        queryFn: ({ signal }: { signal: AbortSignal }) =>
          apiRequest<PaginatedResponse<{ id: number }>>(cheminApi`/api/tasks${requete(buildQueryString({ fields: { tasks: ['id'] }, filter: filtre, page: 1, per_page: 1 }))}`, {
            token: token ?? '',
            signal,
          }),
        enabled: !!token,
        staleTime: 30_000,
      };
    }),
  });
  return Object.fromEntries(COMPTES.flatMap((c, i) => (typeof resultats[i]?.data?.meta.total === 'number' ? [[c, resultats[i]!.data!.meta.total]] : [])));
}

/**
 * Le personnel à qui assigner : la liste des membres est réservée à l'administration ; un refus
 * (403) laisse « Moi » seul, sans erreur.
 */
export function useMembresAssignables(agencyId: number | null | undefined) {
  const { token } = useAuth();
  return useQuery<readonly AgencyStaffMember[], ApiError>({
    queryKey: tachesQueryKeys.membres(agencyId ?? 0),
    queryFn: async () => {
      try {
        return await fetchAgencyAgents(token ?? '', agencyId ?? 0);
      } catch (e) {
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return [];
        throw e;
      }
    },
    enabled: !!token && !!agencyId,
    staleTime: 5 * 60_000,
  });
}

const INVALIDER = { invalidate: [['agent-crm', 'tasks'], ['calendar']] };

export interface ModificationDeTache {
  readonly id: number;
  readonly title?: string;
  readonly due_at?: string | null;
  readonly assigned_to_id?: number;
  readonly status?: 'open' | 'done';
}

/** Modifier une tâche (`PATCH`) : titre, échéance, assigné ou statut — seulement ce qui change. */
export function useModifierTache() {
  return useApiMutation<{ data: TacheDeLaPage }, ModificationDeTache>(
    { path: ({ id }) => cheminApi`/api/tasks/${id}`, method: 'PATCH', body: ({ id: _id, ...corps }) => corps },
    INVALIDER,
  );
}

/** Supprimer une tâche : le geste du créateur (`TaskPolicy::delete`). */
export function useSupprimerTache() {
  return useApiMutation<unknown, { id: number }>({ path: ({ id }) => cheminApi`/api/tasks/${id}`, method: 'DELETE' }, INVALIDER);
}

/** Le modèle Laravel attendu par `StoreTaskRequest::TASKABLE_TYPES`. */
const TASKABLE_CLASS = { customer: 'App\\Models\\Customer', property: 'App\\Models\\Property' } as const;

export interface NouvelleTacheACreer {
  readonly title: string;
  readonly due_at: string | null;
  readonly taskable: { readonly type: 'customer' | 'property'; readonly id: number };
  readonly assigned_to_id: number | null;
}

export function useCreerTache() {
  return useApiMutation<{ data: TacheDeLaPage }, NouvelleTacheACreer>(
    {
      path: '/api/tasks',
      method: 'POST',
      body: (v) => ({
        title: v.title,
        ...(v.due_at ? { due_at: v.due_at } : {}),
        taskable_type: TASKABLE_CLASS[v.taskable.type],
        taskable_id: v.taskable.id,
        ...(v.assigned_to_id !== null ? { assigned_to_id: v.assigned_to_id } : {}),
      }),
    },
    INVALIDER,
  );
}
