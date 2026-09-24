'use client';

import React, { useCallback, useEffect, useMemo } from 'react';
import { LienLocalise } from '@/components/shared/LienLocalise';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, Scale } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Navbar } from '@/components/home/Navbar';
import { NavbarSpacer } from '@/components/home/NavbarSpacer';
import { Footer } from '@/components/home/Footer';
import { EmptyState, ErrorState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
      <NavbarSpacer />

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 md:px-8">
        <header className="mb-6 flex flex-col gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <Scale className="h-4 w-4" aria-hidden="true" />
            {t('eyebrow')}
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground text-balance md:text-3xl">{t('title')}</h1>
          {!showEmpty && (
            <p className="text-sm text-muted-foreground tabular-nums">
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
                className="mb-4 rounded-xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
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
        <LienLocalise href="/properties" className={cn(buttonVariants({ size: 'lg' }), 'h-11 px-4')}>
          <Search className="size-4" aria-hidden="true" />
          {t('cta')}
        </LienLocalise>
      }
    />
  );
}

/**
 * L'attente du comparatif — la MÊME forme que ce qui va la remplacer (TCK-577, vérification
 * adverse).
 *
 * Elle posait une seule grille, bureau comme téléphone, en `repeat(n, minmax(200px, 1fr))` avec une
 * photo 4:3 par colonne : relevé au navigateur le 2026-09-24, requête du comparatif retenue par CDP,
 * `/fr/compare` à quatre biens élargissait la page à 864 px à 320, 360 et 390 (`innerWidth` =
 * `scrollWidth` = 864 : l'émulation mobile agrandit le viewport à la taille du contenu) et à 880 px
 * pour 768 à 768 — un défilement de côté, puis un saut de mise en page quand l'en-tête compact de
 * `CompareCarousel` arrivait.
 *
 * - sous `md`, le squelette reprend l'en-tête compact : vignettes de 56 px, rangée de titres de
 *   44 px, puis des critères — mêmes hauteurs, donc le premier critère ne saute pas ;
 * - au-dessus, les colonnes du tableau, mais en `minmax(0, 1fr)` : elles se partagent la largeur au
 *   lieu d'en exiger 200 px chacune.
 */
function LoadingState({ count }: { count: number }) {
  const grille = { gridTemplateColumns: `repeat(${Math.max(count, 1)}, minmax(0, 1fr))` };
  return (
    <div aria-busy="true">
      {/* Mobile — la forme de `CompareCarousel`. */}
      <div className="md:hidden" data-testid="compare-chargement-mobile">
        <div className="grid gap-2" style={grille}>
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
        <div className="mt-1 grid gap-2 border-b border-border py-1.5" style={grille}>
          {Array.from({ length: count }).map((_, i) => (
            <Skeleton key={i} className="h-11" />
          ))}
        </div>
        <div className="mt-3 space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Bureau — les colonnes du tableau. */}
      <div className="hidden gap-4 md:grid" style={grille} data-testid="compare-chargement-bureau">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="aspect-4/3 w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
