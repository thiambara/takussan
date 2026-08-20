'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/feedback';
import { Skeleton } from '@/components/ui/skeleton';

import { cn } from '@/lib/utils';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';

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
  const messageErreur = useMessageErreurApi();

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
    const message = messageErreur(query.error, t('status.error'));
    // Le bloc d'erreur n'est plus écrit ici : `ErrorState` est L'UNIQUE bloc d'erreur inline du
    // produit (TCK-246), et cette copie-ci portait son propre `role="alert"` et son propre bouton
    // de reprise. Deux implémentations d'une même chose divergent — celle-ci utilisait
    // `bg-destructive/5` quand `DestructiveBanner` tient `bg-destructive/10` + `ring`.
    return query.refetch ? (
      <ErrorState
        className={className}
        message={message}
        onRetry={retry}
        retryLabel={t('actions.retry')}
      />
    ) : (
      <ErrorState className={className} message={message} />
    );
  }

  if (query.data === undefined || query.data === null) {
    return <div className={className}>{emptyFallback ?? null}</div>;
  }

  return <div className={className}>{children(query.data)}</div>;
}
