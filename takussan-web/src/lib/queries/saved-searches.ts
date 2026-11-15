/**
 * Saved searches — React Query hooks + query keys.
 *
 * Backend contract (live on `dev`, `routes/api/saved-searches.php`) :
 * - `GET  /api/saved-searches`      → `{ data: SavedSearch[] }` (auth)
 * - `POST /api/saved-searches`      → `{ data: SavedSearch }` — accepts
 *   `{ name, criteria: Record<string, unknown>, notification_frequency? }`
 * - `PUT  /api/saved-searches/{id}` → partial update
 * - `DELETE /api/saved-searches/{id}` → 204
 *
 * Ticket TCK-047 refers to a `notify` boolean — backend exposes the richer
 * `notification_frequency` enum (`off|daily|weekly`). We default to
 * `off` when the UI hasn't collected a frequency.
 */

'use client';

import { useQueries, useQueryClient } from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useApiMutation, useApiQuery } from '@/hooks/useApiQuery';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { cheminDesNouveaux } from '@/lib/favoris-suivi';
import type { PropertyListItem } from '@/types/property';
import type { SavedSearchPayload } from '@/lib/schemas/search';
import { cheminApi } from '@/lib/chemin-api';
import { origineApi } from '@/lib/config-publique';

/** `instant` retiré par TCK-599 (porteur, 2026-10-06) : l'API le refuse en 422. */
export type SavedSearchNotificationFrequency = 'off' | 'daily' | 'weekly';

export interface SavedSearch {
  id: number;
  user_id: number;
  name: string;
  criteria: Record<string, unknown>;
  notification_frequency: SavedSearchNotificationFrequency | null;
  is_active: boolean;
  results_count: number | null;
  /**
   * TCK-599 — les canaux EFFECTIFS de l'alerte pour cet utilisateur (`inapp` toujours ; `email`,
   * `whatsapp` selon ses préférences), vide pour une alerte coupée. L'interface dit par où
   * l'alerte arrivera à partir de ceci, jamais d'une supposition.
   */
  alert_channels?: SavedSearchAlertChannel[];
  /**
   * TCK-2507 — la dernière ouverture de la recherche (ISO 8601), posée par
   * `POST /api/saved-searches/{id}/viewed`. `null` : jamais ouverte depuis la page Favoris — les
   * biens nouveaux se comptent alors depuis `created_at`.
   */
  last_viewed_at?: string | null;
  created_at: string | null;
}

export type SavedSearchAlertChannel = 'inapp' | 'email' | 'whatsapp';

/** Les fréquences qu'une ligne de `/app/saved-searches` propose, dans l'ordre affiché. */
export const SAVED_SEARCH_FREQUENCIES: readonly SavedSearchNotificationFrequency[] = [
  'off',
  'daily',
  'weekly',
];

export const SAVED_SEARCH_FIELDS = [
  'id',
  'user_id',
  'name',
  'criteria',
  'notification_frequency',
  'is_active',
  'last_viewed_at',
  'created_at',
] as const;

export const savedSearchesQueryKeys = {
  all: ['saved-searches'] as const,
  list: () => ['saved-searches', 'list'] as const,
};

export function useSavedSearchesQuery(options: { enabled?: boolean } = {}) {
  return useApiQuery<{ data: SavedSearch[] }>(
    savedSearchesQueryKeys.list(),
    '/api/saved-searches',
    {
      enabled: options.enabled,
      // P100.05 (TCK-1186) — `fields` inerte : `SavedSearchController::index` ne passe pas par `buildQuery`
      // (`SavedSearch::$queryFields` vide).
      params: { fields: { saved_searches: SAVED_SEARCH_FIELDS } },
    },
  );
}

export function useCreateSavedSearchMutation() {
  return useApiMutation<{ data: SavedSearch }, SavedSearchPayload>(
    { path: '/api/saved-searches', method: 'POST' },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}

export type UpdateSavedSearchPayload = {
  id: number;
  name?: string;
  criteria?: Record<string, unknown>;
  notification_frequency?: SavedSearchNotificationFrequency;
  is_active?: boolean;
};

/**
 * Le segment d'URL d'une recherche sauvegardée : un entier sûr, ou rien — jamais un `../` ni un
 * `?` glissé par un appelant non typé.
 */
export function cheminRecherche(id: unknown): string {
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError('saved_search.invalid_id');
  }
  return cheminApi`/api/saved-searches/${id}`;
}

export function useUpdateSavedSearchMutation() {
  return useApiMutation<{ data: SavedSearch }, UpdateSavedSearchPayload>(
    {
      path: ({ id }) => cheminRecherche(id),
      method: 'PATCH',
      body: ({ id: _id, ...rest }) => rest,
    },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}

export function useDeleteSavedSearchMutation() {
  return useApiMutation<unknown, { id: number }>(
    {
      path: ({ id }) => cheminRecherche(id),
      method: 'DELETE',
      body: () => undefined,
    },
    { invalidate: [savedSearchesQueryKeys.all] },
  );
}

/**
 * TCK-2508 — marque une recherche « vue » (`POST /api/saved-searches/{id}/viewed`, 204) SANS
 * retenir la navigation : l'appel part en arrière-plan, `keepalive`, pour survivre à un départ de
 * la page (lien ouvert dans le même onglet par le navigateur, ou nouvel onglet) ; la liste est
 * relue à sa réponse, et le compte des nouveaux repart de zéro au retour. Un échec ne dit rien :
 * le visiteur voulait la liste, il l'a ; la recherche restera simplement « nouvelle ».
 *
 * `fetch` et non `apiRequest` : celui-ci n'expose pas `keepalive`, et ce POST sans corps n'a besoin
 * que du jeton (la recherche appartient à l'utilisateur, aucun profil n'entre en jeu).
 */
export function useMarquerRechercheVue(): (id: number) => void {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  return (id) => {
    if (!token) return;
    let chemin: string;
    try {
      chemin = `${cheminRecherche(id)}/viewed`;
    } catch {
      return;
    }
    fetch(`${origineApi()}${chemin}`, {
      method: 'POST',
      keepalive: true,
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    })
      .then((reponse) => {
        if (reponse.ok) void queryClient.invalidateQueries({ queryKey: savedSearchesQueryKeys.all });
      })
      .catch(() => undefined);
  };
}

/** Les biens nouveaux d'une recherche : leur total exact et les premiers, pour les vignettes. */
export interface NouveauxDUneRecherche {
  readonly total: number;
  readonly biens: readonly PropertyListItem[];
}

interface ReponseDeRecherche {
  readonly data?: PropertyListItem[];
  readonly meta?: { readonly total?: number };
}

/**
 * TCK-2508 — les biens publiés depuis la dernière ouverture de chaque recherche, une requête par
 * recherche affichée (contrat de TCK-2507). La date de référence fait partie de la clé : après
 * `…/viewed`, la recherche relue porte un autre `last_viewed_at`, donc une autre requête.
 *
 * Rend, par identifiant de recherche, `undefined` tant que la réponse n'est pas là (ou en
 * erreur) : l'écran n'affiche alors aucun compte plutôt qu'un zéro qu'il ne sait pas.
 */
export function useNouveauxDesRecherches(
  recherches: readonly SavedSearch[],
): ReadonlyMap<number, NouveauxDUneRecherche | undefined> {
  const locale = useLocale();
  const { token } = useAuth();
  const requetes = recherches.map((r) => ({
    id: r.id,
    chemin: cheminDesNouveaux(r.criteria ?? {}, r.last_viewed_at ?? r.created_at),
  }));
  const resultats = useQueries({
    queries: requetes.map(({ chemin }) => ({
      queryKey: ['saved-searches', 'nouveaux', chemin] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        apiRequest<ReponseDeRecherche>(chemin as string, { token: token ?? undefined, locale, signal }),
      enabled: chemin !== null,
      staleTime: 60_000,
    })),
  });
  const parId = new Map<number, NouveauxDUneRecherche | undefined>();
  requetes.forEach(({ id }, i) => {
    const data = resultats[i]?.data;
    const total = data?.meta?.total;
    parId.set(id, typeof total === 'number' ? { total, biens: data?.data ?? [] } : undefined);
  });
  return parId;
}
