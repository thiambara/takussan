'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PropertyForm } from '@/components/property-form';
import { PropertyMediaPanel } from '@/components/property-dashboard/PropertyMediaPanel';
import { PropertyOverviewPanel } from '@/components/property-dashboard/PropertyOverviewPanel';
import { formatCurrency } from '@/lib/format';
import type { PropertyDetail } from '@/types/property';
import type { Tag } from '@/types/tag';
import { useStateSyncedWith } from '@/hooks/useStateSyncedWith';
import { useTranslations } from 'next-intl';

const TAB_VALUES = ['overview', 'edit', 'media', 'history'] as const;
type TabKey = (typeof TAB_VALUES)[number];

function isTabKey(value: string | null): value is TabKey {
  return value !== null && (TAB_VALUES as readonly string[]).includes(value);
}

interface Props {
  readonly property: PropertyDetail;
  readonly tags: Tag[];
}

export function PropertyDetailTabs({ property, tags }: Props) {
  const t = useTranslations('property.dashboard.tabs');
  const searchParams = useSearchParams();
  // TCK-316 — l'onglet suit l'URL sans aller-retour serveur, et SANS effet :
  // l'ancienne version rendait l'onglet précédent une frame avant de corriger.
  //
  // ⚠️ Un `?tab=` absent ou inconnu retombe sur `overview`, jamais sur l'onglet
  // courant : `useStateSyncedWith` ne resynchronise que lorsque la valeur
  // externe CHANGE, donc un clic utilisateur (qui écrit l'URL par
  // `replaceState`, sans notifier le routeur) n'est pas écrasé au rendu suivant.
  const urlTab = searchParams.get('tab');
  const [tab, setTab] = useStateSyncedWith<TabKey>(isTabKey(urlTab) ? urlTab : 'overview');

  const handleChange = useCallback(
    (value: TabKey) => {
      setTab(value);
      const params = new URLSearchParams(window.location.search);
      if (value === 'overview') params.delete('tab');
      else params.set('tab', value);
      const qs = params.toString();
      const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', url);
    },
    [],
  );

  const priceHistory = property.price_history ?? [];

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        if (typeof value === 'string' && isTabKey(value)) handleChange(value);
      }}
      className="space-y-6"
    >
      <TabsList>
        <TabsTrigger value="overview">{t('overview')}</TabsTrigger>
        <TabsTrigger value="edit">{t('edit')}</TabsTrigger>
        <TabsTrigger value="media">
          {t('media', { count: property.photos?.length ?? 0 })}
        </TabsTrigger>
        <TabsTrigger value="history">
          {t('history', { count: priceHistory.length })}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <PropertyOverviewPanel property={property} onJumpTo={handleChange} />
      </TabsContent>

      <TabsContent value="edit">
        <PropertyForm mode="edit" property={property} tags={tags} />
      </TabsContent>

      <TabsContent value="media">
        <PropertyMediaPanel propertyId={property.id} />
      </TabsContent>

      <TabsContent value="history">
        <section className="rounded-xl bg-card p-6">
          <header>
            <h2 className="text-base font-semibold text-foreground">
              {t('fullPriceHistory')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('fullPriceHistoryHint')}</p>
          </header>
          {priceHistory.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">{t('noPriceHistory')}</p>
          ) : (
            <ol className="mt-4 divide-y divide-muted text-sm">
              {priceHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="text-muted-foreground">
                    {entry.changed_at?.slice(0, 10) ?? t('unknownDate')}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(entry.old_price, 'fr', { currency: entry.currency })}{' '}
                    →{' '}
                    {formatCurrency(entry.new_price, 'fr', { currency: entry.currency })}
                  </span>
                  {entry.reason ? (
                    <span className="basis-full text-xs text-muted-foreground">
                      {entry.reason}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>
      </TabsContent>
    </Tabs>
  );
}
