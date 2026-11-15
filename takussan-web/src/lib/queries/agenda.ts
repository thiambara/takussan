'use client';

import { useInfiniteQuery } from '@tanstack/react-query';

import { useAuth } from '@/context/AuthContext';
import { useApiQuery } from '@/hooks/useApiQuery';
import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import type { PaginatedResponse } from '@/types/api';

/**
 * TCK-2597 — les biens du filtre de l'agenda : l'index des biens de la console, par leur vrai titre
 * — y compris un bien sans événement dans la période (le filtre était déduit des événements et
 * nommait le bien d'après l'un d'eux). La recherche est celle du serveur (`filter[search]`).
 */
export interface BienDeLAgenda {
  readonly id: number;
  readonly title: string;
}

export const BIEN_DE_L_AGENDA_FIELDS = ['id', 'title'];

export const agendaQueryKeys = {
  biens: (recherche: string) => ['properties', 'agenda', 'biens', recherche] as const,
  bien: (id: number) => ['properties', 'agenda', 'bien', id] as const,
};

/** Vingt biens par ordre de titre ; dès deux caractères, ceux que la recherche trouve. */
export function useBiensDeLAgenda(recherche: string, enabled = true) {
  const terme = recherche.trim().length >= 2 ? recherche.trim() : '';
  return useApiQuery<PaginatedResponse<BienDeLAgenda>>(agendaQueryKeys.biens(terme), '/api/properties', {
    params: {
      fields: { properties: BIEN_DE_L_AGENDA_FIELDS },
      ...(terme ? { filter: { search: terme } } : {}),
      sort: ['title'],
      page: 1,
      per_page: 20,
    },
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Le titre du bien choisi, quand l'URL ne porte que son identifiant. */
export function useBienDeLAgenda(id: number | null) {
  return useApiQuery<PaginatedResponse<BienDeLAgenda>>(agendaQueryKeys.bien(id ?? 0), '/api/properties', {
    params: { fields: { properties: BIEN_DE_L_AGENDA_FIELDS }, filter: { id: String(id ?? 0) }, page: 1, per_page: 1 },
    enabled: id !== null,
    staleTime: 5 * 60_000,
  });
}

/** Les biens que touchent les événements de la fenêtre, par leur titre (`filter[id]` en liste). */
export function useBiensParIdentifiants(ids: readonly number[], enabled = true) {
  const liste = [...ids].sort((a, b) => a - b).slice(0, 100);
  return useApiQuery<PaginatedResponse<BienDeLAgenda>>(['properties', 'agenda', 'ids', liste.join(',')], '/api/properties', {
    params: { fields: { properties: BIEN_DE_L_AGENDA_FIELDS }, filter: { id: liste.join(',') }, sort: ['title'], page: 1, per_page: 100 },
    enabled: enabled && liste.length > 0,
    staleTime: 5 * 60_000,
  });
}

export const PAR_PAGE_DES_BIENS_LIBRES = 20;

/**
 * Les biens en location du portefeuille, par ordre de titre et par pages (« Voir plus de biens ») :
 * l'occupation montre aussi les biens libres, sans événement dans la fenêtre.
 */
export function useBiensLocatifs(enabled = true) {
  const { token } = useAuth();
  return useInfiniteQuery({
    queryKey: ['properties', 'agenda', 'locatifs'],
    queryFn: ({ pageParam, signal }) =>
      apiRequest<PaginatedResponse<BienDeLAgenda>>(
        cheminApi`/api/properties${requete(buildQueryString({ fields: { properties: BIEN_DE_L_AGENDA_FIELDS }, filter: { contract_type: 'rent' }, sort: ['title'], page: pageParam, per_page: PAR_PAGE_DES_BIENS_LIBRES }))}`,
        { token: token ?? '', signal },
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
    enabled: enabled && !!token,
    staleTime: 5 * 60_000,
  });
}
