'use client';

import { useCallback, useMemo, useState } from 'react';
import { Home, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/feedback';
import { PropertyCardStandard } from '@/components/property/cards/PropertyCardStandard';
import type { PropertyListItem } from '@/types/property';
import {
  fetchAgentPortfolio,
  fetchAgencyPortfolio,
  type PortfolioContract,
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

/** La liste d'un onglet : ses biens, la dernière page chargée, et si sa première page l'a été. */
interface TabList {
  readonly items: PropertyListItem[];
  readonly page: number;
  readonly loaded: boolean;
}

export function PortfolioTabs({ portfolio, emptyHint, totals, source }: PortfolioTabsProps) {
  const t = useTranslations('publicProfile.portfolio');
  const loadPage = useMemo(
    () =>
      source
        ? (page: number, contract?: PortfolioContract): Promise<PortfolioPage> =>
            source.kind === 'agent'
              ? fetchAgentPortfolio(source.slug, page, 24, contract)
              : fetchAgencyPortfolio(source.slug, page, 24, contract)
        : null,
    [source],
  );
  const [tab, setTab] = useState<TabKey>('all');

  const displayedTotals = totals ?? {
    all: portfolio.length,
    rent: portfolio.filter((p) => p.contract_type === 'rent').length,
    sale: portfolio.filter((p) => p.contract_type === 'sale').length,
  };

  // TCK-1730 (P168.02) — chaque onglet a sa liste et sa page. « Tous » part des biens rendus par
  // la page ; « À louer » et « À vendre » en partent seulement s'ils y sont tous, sinon leur
  // première page se charge par l'API (`filter[contract_type]`) à la première ouverture. Filtrer
  // les biens déjà chargés laissait l'onglet vide, sans « Voir plus », quand ses biens n'étaient
  // pas dans les 24 plus récents.
  const [lists, setLists] = useState<Record<TabKey, TabList>>(() => {
    const seed = (contract: PortfolioContract): TabList => {
      const items = portfolio.filter((p) => p.contract_type === contract);
      const complete = !loadPage || items.length >= displayedTotals[contract];
      return complete ? { items, page: 1, loaded: true } : { items: [], page: 0, loaded: false };
    };
    return { all: { items: portfolio, page: 1, loaded: true }, rent: seed('rent'), sale: seed('sale') };
  });
  const [loadingTab, setLoadingTab] = useState<TabKey | null>(null);

  const current = lists[tab];
  const isLoading = loadingTab === tab;
  const hasMore = !!loadPage && current.items.length < displayedTotals[tab];

  const loadNext = useCallback(
    async (key: TabKey) => {
      if (!loadPage || loadingTab !== null) return;
      setLoadingTab(key);
      try {
        const next = await loadPage(lists[key].page + 1, key === 'all' ? undefined : key);
        setLists((prev) => {
          const seen = new Set(prev[key].items.map((p) => p.id));
          const merged = [...prev[key].items];
          for (const item of next.data) {
            if (!seen.has(item.id)) merged.push(item);
          }
          return { ...prev, [key]: { items: merged, page: next.meta.current_page, loaded: true } };
        });
      } catch {
        // Un échec rend l'onglet à son état vide : « Voir plus » reste offert pour réessayer.
        setLists((prev) => ({ ...prev, [key]: { ...prev[key], loaded: true } }));
      } finally {
        setLoadingTab(null);
      }
    },
    [loadPage, loadingTab, lists],
  );

  const selectTab = (value: TabKey) => {
    setTab(value);
    if (!lists[value].loaded) void loadNext(value);
  };

  return (
    <Tabs value={tab} onValueChange={(value) => selectTab((value ?? 'all') as TabKey)}>
      <TabsList aria-label={t('filterAria')}>
        <TabsTrigger value="all">
          {t('tabs.all')}
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">{displayedTotals.all}</span>
        </TabsTrigger>
        <TabsTrigger value="rent">
          {t('tabs.rent')}
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">{displayedTotals.rent}</span>
        </TabsTrigger>
        <TabsTrigger value="sale">
          {t('tabs.sale')}
          <span className="ml-2 text-xs tabular-nums text-muted-foreground">{displayedTotals.sale}</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value={tab} className="mt-6">
        {current.items.length === 0 ? (
          isLoading || !current.loaded ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {t('loading')}
            </p>
          ) : (
            <EmptyState
              icon={<Home className="size-8" aria-hidden />}
              title={tab === 'rent' ? t('empty.rent') : tab === 'sale' ? t('empty.sale') : t('empty.all')}
              description={emptyHint ?? t('emptyHint')}
            />
          )
        ) : (
          <div className="grid gap-x-5 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {current.items.map((p, index) => (
              <div key={p.id} className="w-full [&>article]:w-full">
                <PropertyCardStandard
                  property={p}
                  index={index}
                  sizes={CARD_SIZES_PORTFOLIO_GRID}
                />
              </div>
            ))}
          </div>
        )}

        {hasMore && current.loaded && (
          <div className="mt-8 flex justify-center">
            <Button
              variant="outline"
              size="lg"
              onClick={() => void loadNext(tab)}
              disabled={isLoading}
              aria-label={t('loadMoreAria')}
            >
              {isLoading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t('loading')}
                </>
              ) : (
                t('loadMore', { count: displayedTotals[tab] - current.items.length })
              )}
            </Button>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
