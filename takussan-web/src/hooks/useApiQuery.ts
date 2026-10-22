'use client';

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseMutationOptions,
  type UseMutationResult,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { useLocale } from 'next-intl';
import { useCallback, useRef } from 'react';
import { apiRequest, buildQueryString, ApiError, type RequestOptions } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { useGardeDoubleFacteur } from '@/components/auth/garde-double-facteur-contexte';
import { avecGardeDoubleFacteur } from '@/lib/double-facteur';
import type { SpatieQueryParams } from '@/types/api';

type UseApiQueryOptions<T> = Omit<
  UseQueryOptions<T, ApiError>,
  'queryKey' | 'queryFn'
> & {
  /**
   * Request init passed through to `apiRequest`. `token` is injected by the
   * caller (server components pass it from cookies; client callers can rely
   * on the browser cookie being sent by same-origin requests through the
   * Next route handlers — they don't need to pass a token here).
   */
  request?: Omit<RequestOptions, 'method' | 'body' | 'signal'>;
  /**
   * Spatie-compliant query params appended to the path. Prefer this over
   * hand-built query strings — see CLAUDE.md → "API — Conventions frontend".
   */
  params?: SpatieQueryParams;
};

/**
 * Thin wrapper around `useQuery` that routes through `apiRequest`:
 *
 * - types the response as `T`, errors as `ApiError`
 * - forwards the current next-intl locale to `Accept-Language` by default
 * - serializes `SpatieQueryParams` with {@link buildQueryString}
 * - supports aborting in-flight requests via TanStack's `signal`
 *
 * `queryKey` must uniquely identify the dataset including the parameters —
 * React Query uses it for caching and invalidation. Conventional shape:
 * `['properties', 'list', params]`.
 */
export function useApiQuery<T>(
  queryKey: QueryKey,
  path: string,
  options: UseApiQueryOptions<T> = {},
): UseQueryResult<T, ApiError> {
  const locale = useLocale();
  const { token } = useAuth();
  const { request, params, ...rest } = options;

  const queryFn = useCallback(
    async ({ signal }: { signal: AbortSignal }) => {
      const qs = params ? buildQueryString(params) : '';
      const fullPath = qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
      return apiRequest<T>(fullPath, {
        ...request,
        token: request?.token ?? token ?? undefined,
        locale: request?.locale ?? locale,
        signal,
      });
    },
    [path, params, request, locale, token],
  );

  return useQuery<T, ApiError>({
    queryKey,
    queryFn,
    ...rest,
  });
}

type UseApiMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, ApiError, TVariables>,
  'mutationFn'
> & {
  /**
   * Query keys invalidated on success. Accepts a static list or a function
   * that receives the mutation input/output for dynamic invalidation (e.g.
   * invalidating a specific `['property', id]` key after an update).
   */
  invalidate?:
    | QueryKey[]
    | ((args: { data: TData; variables: TVariables }) => QueryKey[]);
  request?: Omit<RequestOptions, 'method' | 'body' | 'signal'>;
  /**
   * TCK-1396 (ADR-0072 § 7) — envoie une `Idempotency-Key` née au montage du hook (l'ouverture du
   * formulaire), gardée d'un essai à l'autre tant qu'aucun envoi n'a réussi, quelle que soit
   * l'erreur, et renouvelée sur succès ou sur 422 `idempotency.key_reused`. Une route de l'API qui
   * porte l'intergiciel `idempotent` rejoue alors la première réponse au lieu d'écrire deux fois.
   * Un `Idempotency-Key` posé dans `request.headers` l'emporte (le boost, TCK-822).
   */
  idempotence?: boolean;
};

/** TCK-1396 — ce que `useApiMutation` rend en plus de `useMutation`. */
export type ApiMutationResult<TData, TVariables> = UseMutationResult<TData, ApiError, TVariables> & {
  /**
   * Renouvelle la clé d'idempotence : pour un composant qui survit à son formulaire (un dialogue
   * qui reste monté fermé), à appeler à la fermeture. Sans effet visible sans `idempotence`.
   */
  renouvelerCleIdempotence: () => void;
};

function nouvelleCleIdempotence(): string {
  return globalThis.crypto.randomUUID();
}

function cleDejaServie(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 422) return false;
  const data = error.data as { code?: unknown } | null;
  return data !== null && typeof data === 'object' && data.code === 'idempotency.key_reused';
}

type MutationShape<TVariables> = {
  path: string | ((variables: TVariables) => string);
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /**
   * How to derive the request body from the mutation variables. Defaults to
   * the variables themselves, which covers the common `mutate(payload)` case.
   */
  body?: (variables: TVariables) => unknown;
  /**
   * Treat the body as FormData instead of JSON (multipart uploads).
   */
  formData?: boolean;
};

/**
 * `useMutation` wrapper that
 *
 * - calls `apiRequest` with typed errors (`ApiError`)
 * - forwards the active locale to `Accept-Language`
 * - invalidates the listed query keys on success
 * - TCK-589 — résout sur place un refus `two_factor_required` / `two_factor_step_up_required`
 *   (garde des consoles, `GardeDoubleFacteur`), puis rejoue la requête
 *
 * Usage:
 *
 * ```ts
 * const mutation = useApiMutation<Property, CreateProperty>(
 *   { path: '/api/properties', method: 'POST' },
 *   {
 *     invalidate: [['properties', 'list']],
 *     onSuccess: () => toast({ title: 'Bien créé' }),
 *   },
 * );
 * mutation.mutate(payload);
 * ```
 */
export function useApiMutation<TData, TVariables = void>(
  shape: MutationShape<TVariables>,
  options: UseApiMutationOptions<TData, TVariables> = {},
): ApiMutationResult<TData, TVariables> {
  const locale = useLocale();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const garde = useGardeDoubleFacteur();
  const { invalidate, request, onSuccess, idempotence, ...rest } = options;
  // TCK-1396 — la clé vit hors de l'état React : la renouveler ne re-rend rien.
  const cle = useRef<string | null>(null);
  const cleCourante = (): string => {
    cle.current ??= nouvelleCleIdempotence();
    return cle.current;
  };
  const renouvelerCleIdempotence = useCallback(() => {
    cle.current = nouvelleCleIdempotence();
  }, []);

  const mutation = useMutation<TData, ApiError, TVariables>({
    mutationFn: async (variables) => {
      const resolvedPath =
        typeof shape.path === 'function' ? shape.path(variables) : shape.path;
      const body = shape.body ? shape.body(variables) : variables;
      const headers = idempotence
        ? { 'Idempotency-Key': cleCourante(), ...request?.headers }
        : request?.headers;
      try {
        return await avecGardeDoubleFacteur(
          () =>
            apiRequest<TData>(resolvedPath, {
              ...request,
              ...(headers ? { headers } : {}),
              method: shape.method ?? 'POST',
              body,
              formData: shape.formData,
              token: request?.token ?? token ?? undefined,
              locale: request?.locale ?? locale,
            }),
          garde,
        );
      } catch (error) {
        if (idempotence && cleDejaServie(error)) renouvelerCleIdempotence();
        throw error;
      }
    },
    onSuccess: async (data, variables, ...rest2) => {
      if (idempotence) renouvelerCleIdempotence();
      const keys = typeof invalidate === 'function'
        ? invalidate({ data, variables })
        : invalidate ?? [];
      await Promise.all(
        keys.map((key) => queryClient.invalidateQueries({ queryKey: key })),
      );
      await onSuccess?.(data, variables, ...rest2);
    },
    ...rest,
  });

  return { ...mutation, renouvelerCleIdempotence };
}
