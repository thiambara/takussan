'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
import { EmptyState, ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useCompare as useCompareStore } from '@/context/CompareContext';
import { useCompare as useCompareFetch } from '@/hooks/useCompare';
import { idsToCsv, parseIdsCsv } from '@/lib/compare';
import type { PropertyDetail } from '@/types/property';
import { CompareTable, type CompareColumn } from '@/components/compare/CompareTable';
import { CompareCarousel } from '@/components/compare/CompareCarousel';

/**
 * TCK-082 — `/compare` route client.
 *
 * Rules:
 * - URL (`?ids=1,2,3`) is the **source of truth on page load**. Cold-share
 *   works: the store is replaced with whatever the URL carries.
 * - On subsequent selection changes (Retirer / floating bar) we keep the
 *   URL in sync using `router.replace`.
 * - A single fetch is issued per id-set change via `useCompareFetch`.
 */
export function CompareClient() {
  const t = useTranslations('compare');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { ids: storeIds, isHydrated, replace, remove } = useCompareStore();

  const urlIdsCsv = searchParams.get('ids');
  const urlIds = useMemo(() => parseIdsCsv(urlIdsCsv), [urlIdsCsv]);

  // ── Cold-share hydration ──────────────────────────────────────────────
  // If the URL carries ids, they *replace* the local selection on mount.
  // After hydration, the store owns the selection and drives the URL.
  useEffect(() => {
    if (!isHydrated) return;
    const urlCsv = idsToCsv(urlIds);
    const storeCsv = idsToCsv(storeIds);
    if (urlCsv && urlCsv !== storeCsv) {
      replace(urlIds);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated]);

  // ── Keep URL in sync when the store changes ───────────────────────────
  useEffect(() => {
    if (!isHydrated) return;
    const storeCsv = idsToCsv(storeIds);
    const urlCsv = urlIdsCsv ?? '';
    if (storeCsv === urlCsv) return;
    const params = new URLSearchParams(searchParams.toString());
    if (storeCsv) {
      params.set('ids', storeCsv);
    } else {
      params.delete('ids');
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeIds, isHydrated]);

  // ── Choose the effective list of ids to display ───────────────────────
  // Before hydration we trust the URL so SSR → CSR handoff stays smooth.
  const effectiveIds = isHydrated ? storeIds : urlIds;

  const { properties, loading, error, requestedIds, returnedIds } =
    useCompareFetch(effectiveIds);

  const handleRemove = useCallback(
    (id: number) => {
      remove(id);
    },
    [remove],
  );

  const columns = useMemo<CompareColumn[]>(() => {
    return effectiveIds.map((id) => ({
      id,
      property: findProperty(properties, id),
    }));
  }, [effectiveIds, properties]);

  const showEmpty = effectiveIds.length < 2;
  const showLoading = !showEmpty && loading && properties === null;
  const showError = !!error;
  const showUnavailableNotice =
    !showEmpty && requestedIds !== null && returnedIds !== null && returnedIds.length < requestedIds.length;

  return (
    <div className="min-h-screen bg-surface">
      <Navbar />
      <div className="h-[133px]" aria-hidden="true" />

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 md:px-8">
        <header className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {t('eyebrow')}
          </div>
          <h1 className="text-2xl font-bold text-stone-900 md:text-3xl">{t('title')}</h1>
          {!showEmpty && (
            <p className="text-sm text-stone-500">
              {t('subtitle', { count: effectiveIds.length })}
            </p>
          )}
        </header>

        {showEmpty ? (
          <CompareEmpty />
        ) : showLoading ? (
          <LoadingState count={effectiveIds.length} />
        ) : showError ? (
          <ErrorState message={error!} />
        ) : (
          <>
            {showUnavailableNotice && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
              >
                {t('unavailableNotice', {
                  missing: (requestedIds?.length ?? 0) - (returnedIds?.length ?? 0),
                })}
              </div>
            )}

            {/* Desktop */}
            <div className="hidden md:block">
              <CompareTable columns={columns} onRemove={handleRemove} />
            </div>

            {/* Mobile */}
            <div className="md:hidden">
              <CompareCarousel columns={columns} onRemove={handleRemove} />
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}

function findProperty(
  properties: PropertyDetail[] | null,
  id: number,
): PropertyDetail | null {
  if (!properties) return null;
  return properties.find((p) => p.id === id) ?? null;
}

function CompareEmpty() {
  const t = useTranslations('compare.empty');
  return (
    <EmptyState
      icon={<Scale className="size-8" aria-hidden="true" />}
      title={t('title')}
      description={t('description')}
      action={
        <LienLocalise href="/properties" className={buttonVariants()}>
          <Search className="size-4" aria-hidden="true" />
          {t('cta')}
        </LienLocalise>
      }
    />
  );
}

function LoadingState({ count }: { count: number }) {
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${count}, minmax(200px, 1fr))` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-4/3 w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-32 w-full" />
        </div>
      ))}
    </div>
  );
}

