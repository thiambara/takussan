'use client';

import { useCallback, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { PropertyCardStandard } from '@/components/property/cards/PropertyCardStandard';
import type { PropertyListItem } from '@/types/property';
import {
  fetchAgentPortfolio,
  fetchAgencyPortfolio,
  type PortfolioPage,
} from '@/lib/queries/profile-portfolio';
import { CARD_SIZES_PORTFOLIO_GRID } from '@/components/property/card-image-sizes';

type TabKey = 'all' | 'rent' | 'sale';

interface PortfolioTabsProps {
  readonly portfolio: PropertyListItem[];
  readonly emptyHint?: string;
  /** Vrais totaux DB (non capés par la limite d'affichage). */
  readonly totals?: { all: number; rent: number; sale: number };
  /** Si renseigné, active le bouton "Voir plus" branché sur les endpoints paginés. */
  readonly source?: { kind: 'agent' | 'agency'; slug: string };
}

export function PortfolioTabs({ portfolio, emptyHint, totals, source }: PortfolioTabsProps) {
  const t = useTranslations('publicProfile.portfolio');
  const loadMore = useMemo(
    () =>
      source
        ? (page: number): Promise<PortfolioPage> =>
            source.kind === 'agent'
              ? fetchAgentPortfolio(source.slug, page)
              : fetchAgencyPortfolio(source.slug, page)
        : null,
    [source],
  );
  const [tab, setTab] = useState<TabKey>('all');
  const [accumulated, setAccumulated] = useState<PropertyListItem[]>(portfolio);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const buckets = useMemo(() => {
    const rent = accumulated.filter((p) => p.contract_type === 'rent');
    const sale = accumulated.filter((p) => p.contract_type === 'sale');
    return { all: accumulated, rent, sale };
  }, [accumulated]);

  const displayedTotals = totals ?? {
    all: buckets.all.length,
    rent: buckets.rent.length,
    sale: buckets.sale.length,
  };

  const hasMore = !!loadMore && accumulated.length < displayedTotals.all;
  const current = buckets[tab];

  const handleLoadMore = useCallback(async () => {
    if (!loadMore || isLoading) return;
    setIsLoading(true);
    try {
      const next = await loadMore(currentPage + 1);
      setAccumulated((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        const merged = [...prev];
        for (const item of next.data) {
          if (!seen.has(item.id)) merged.push(item);
        }
        return merged;
      });
      setCurrentPage(next.meta.current_page);
    } finally {
      setIsLoading(false);
    }
  }, [loadMore, isLoading, currentPage]);

  return (
    <Tabs value={tab} onValueChange={(value) => setTab((value ?? 'all') as TabKey)}>
      <TabsList aria-label={t('filterAria')}>
        <TabsTrigger value="all">
          {t('tabs.all')}
          <span className="ml-2 text-xs text-muted-foreground">{displayedTotals.all}</span>
        </TabsTrigger>
        <TabsTrigger value="rent">
          {t('tabs.rent')}
          <span className="ml-2 text-xs text-muted-foreground">{displayedTotals.rent}</span>
        </TabsTrigger>
        <TabsTrigger value="sale">
          {t('tabs.sale')}
          <span className="ml-2 text-xs text-muted-foreground">{displayedTotals.sale}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value={tab} className="mt-6">
        {current.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card p-10 text-center">
            <p className="font-display text-xl text-foreground">
              {tab === 'rent' && t('empty.rent')}
              {tab === 'sale' && t('empty.sale')}
              {tab === 'all' && t('empty.all')}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {emptyHint ?? t('emptyHint')}
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {current.map((p, index) => (
                <div key={p.id} className="w-full [&>article]:w-full">
                  <PropertyCardStandard
                    property={p}
                    index={index}
                    sizes={CARD_SIZES_PORTFOLIO_GRID}
                  />
                </div>
              ))}
            </div>

            {hasMore && (
              <div className="mt-8 flex justify-center">
                <Button
                  variant="outline"
                  size="lg"
                  onClick={handleLoadMore}
                  disabled={isLoading}
                  aria-label={t('loadMoreAria')}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t('loading')}
                    </>
                  ) : (
                    t('loadMore', { count: String(displayedTotals.all - accumulated.length) })
                  )}
                </Button>
              </div>
            )}
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
