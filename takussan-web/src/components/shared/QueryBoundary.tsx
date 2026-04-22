'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/utils';

type QueryBoundaryState<T> = {
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  data: T | undefined;
  refetch?: () => void;
};

type QueryBoundaryProps<T> = {
  query: QueryBoundaryState<T>;
  children: (data: T) => ReactNode;
  /** Custom loading fallback. Defaults to a skeleton block. */
  loadingFallback?: ReactNode;
  /** Custom error fallback. Receives the error + retry callback. */
  errorFallback?: (args: { error: unknown; retry: () => void }) => ReactNode;
  /**
   * Rendered when the query settles with no data — e.g. an empty 200 object.
   * Defaults to the loading skeleton so UIs stay stable.
   */
  emptyFallback?: ReactNode;
  className?: string;
};

/**
 * Bridges a `useQuery` result to a React subtree:
 *
 *   - loading → configurable skeleton (defaults to a stack of `Skeleton`)
 *   - error   → inline retry card
 *   - success → `children(data)`
 *
 * Intentionally minimal — callers wire toasts at the mutation layer, not
 * here. Designed to wrap a query result directly:
 *
 * ```tsx
 * const query = useApiQuery<Property[]>(['properties'], '/api/properties');
 * return (
 *   <QueryBoundary query={query}>
 *     {(items) => <PropertyList items={items} />}
 *   </QueryBoundary>
 * );
 * ```
 */
export function QueryBoundary<T>({
  query,
  children,
  loadingFallback,
  errorFallback,
  emptyFallback,
  className,
}: QueryBoundaryProps<T>) {
  const t = useTranslations('common');

  if (query.isLoading) {
    return (
      <div className={cn('space-y-3', className)} role="status" aria-live="polite">
        {loadingFallback ?? (
          <>
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </>
        )}
        <span className="sr-only">{t('status.loading')}</span>
      </div>
    );
  }

  if (query.isError) {
    const retry = () => query.refetch?.();
    if (errorFallback) {
      return <div className={className}>{errorFallback({ error: query.error, retry })}</div>;
    }
    const message =
      query.error instanceof ApiError
        ? query.error.displayMessage
        : t('status.error');
    return (
      <div
        role="alert"
        className={cn(
          'rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive',
          className,
        )}
      >
        <p className="font-medium">{message}</p>
        {query.refetch ? (
          <div className="mt-3">
            <Button type="button" size="sm" variant="outline" onClick={retry}>
              {t('actions.retry')}
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (query.data === undefined || query.data === null) {
    return <div className={className}>{emptyFallback ?? null}</div>;
  }

  return <div className={className}>{children(query.data)}</div>;
}
