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
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab');
  const [tab, setTab] = useState<TabKey>(isTabKey(initial) ? initial : 'overview');

  // Sync URL ↔ state without triggering a server round-trip.
  useEffect(() => {
    const next = searchParams.get('tab');
    if (isTabKey(next) && next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
        <TabsTrigger value="overview">Aperçu</TabsTrigger>
        <TabsTrigger value="edit">Édition</TabsTrigger>
        <TabsTrigger value="media">
          Médias ({property.photos?.length ?? 0})
        </TabsTrigger>
        <TabsTrigger value="history">
          Historique ({priceHistory.length})
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
        <section className="rounded-xl bg-app-surface-1 p-6">
          <header>
            <h2 className="text-base font-semibold text-app-ink">
              Historique complet des prix
            </h2>
            <p className="text-xs text-app-ink-muted">
              Toutes les évolutions enregistrées pour ce bien.
            </p>
          </header>
          {priceHistory.length === 0 ? (
            <p className="mt-4 text-sm text-app-ink-muted">
              Aucune évolution de prix enregistrée pour ce bien.
            </p>
          ) : (
            <ol className="mt-4 divide-y divide-app-surface-2 text-sm">
              {priceHistory.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <span className="text-app-ink-muted">
                    {entry.changed_at?.slice(0, 10) ?? 'Date inconnue'}
                  </span>
                  <span className="font-medium text-app-ink">
                    {formatCurrency(entry.old_price, 'fr', { currency: entry.currency })}{' '}
                    →{' '}
                    {formatCurrency(entry.new_price, 'fr', { currency: entry.currency })}
                  </span>
                  {entry.reason ? (
                    <span className="basis-full text-xs text-app-ink-muted">
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
