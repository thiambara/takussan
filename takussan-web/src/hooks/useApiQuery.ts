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
import { useCallback } from 'react';
import { apiRequest, buildQueryString, ApiError, type RequestOptions } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
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
};

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
): UseMutationResult<TData, ApiError, TVariables> {
  const locale = useLocale();
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const { invalidate, request, onSuccess, ...rest } = options;

  return useMutation<TData, ApiError, TVariables>({
    mutationFn: async (variables) => {
      const resolvedPath =
        typeof shape.path === 'function' ? shape.path(variables) : shape.path;
      const body = shape.body ? shape.body(variables) : variables;
      return apiRequest<TData>(resolvedPath, {
        ...request,
        method: shape.method ?? 'POST',
        body,
        formData: shape.formData,
        token: request?.token ?? token ?? undefined,
        locale: request?.locale ?? locale,
      });
    },
    onSuccess: async (data, variables, ...rest2) => {
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
}
