'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { Footer } from '@/components/home/Footer';
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
          <EmptyState />
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

function EmptyState() {
  const t = useTranslations('compare.empty');
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-white py-20 text-center">
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary"
        aria-hidden="true"
      >
        <Scale className="h-8 w-8" />
      </div>
      <h2 className="mb-1 text-lg font-bold text-stone-900">{t('title')}</h2>
      <p className="mb-6 max-w-md text-sm text-stone-500">{t('description')}</p>
      <Link
        href="/properties"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        {t('cta')}
      </Link>
    </div>
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

function ErrorState({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"
    >
      {message}
    </div>
  );
}
