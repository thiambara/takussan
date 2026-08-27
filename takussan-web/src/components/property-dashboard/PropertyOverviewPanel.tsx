'use client';

import { ArrowRight, MapPin, Pencil } from 'lucide-react';

import { StatCard } from '@/components/charts/StatCard';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/format';
import type { PropertyDetail } from '@/types/property';
import { useTranslations } from 'next-intl';

type TabKey = 'overview' | 'edit' | 'media' | 'history';

interface Props {
  readonly property: PropertyDetail;
  readonly onJumpTo: (tab: TabKey) => void;
}

interface ChecklistItem {
  readonly id: string;
  readonly labelKey: string;
  readonly done: boolean;
  readonly target: TabKey;
}

function buildChecklist(property: PropertyDetail): ChecklistItem[] {
  const description = (property.description ?? '').trim();
  return [
    {
      id: 'description',
      labelKey: 'checklist.description',
      done: description.length >= 80,
      target: 'edit',
    },
    {
      id: 'gps',
      labelKey: 'checklist.gps',
      done:
        property.location?.latitude != null &&
        property.location?.longitude != null,
      target: 'edit',
    },
    {
      id: 'cover',
      labelKey: 'checklist.cover',
      done: Boolean(property.main_photo_url),
      target: 'media',
    },
    {
      id: 'title-type',
      labelKey: 'checklist.titleType',
      done: Boolean(property.title_type),
      target: 'edit',
    },
  ];
}

export function PropertyOverviewPanel({ property, onJumpTo }: Props) {
  const t = useTranslations('property.dashboard.overview');
  const checklist = buildChecklist(property);
  const remaining = checklist.filter((c) => !c.done);
  const recentPrices = property.price_history?.slice(0, 5) ?? [];
  const fullAddress =
    property.location?.full ||
    [
      property.location?.street,
      property.location?.quarter,
      property.location?.city,
      property.location?.region,
    ]
      .filter(Boolean)
      .join(', ');

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label={t('views')}
          value={property.views_count ?? 0}
          hint={t('viewsHint')}
        />
        <StatCard
          label={t('favorites')}
          value={property.favorites_count ?? 0}
          hint={t('favoritesHint')}
        />
        <StatCard
          label={t('rating')}
          value={
            property.average_rating != null
              ? property.average_rating.toFixed(1)
              : '—'
          }
          hint={t('ratingHint', { count: property.reviews_count ?? 0 })}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl bg-card p-6">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('address')}</h2>
              <p className="text-xs text-muted-foreground">{t('addressHint')}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onJumpTo('edit')}
            >
              <Pencil aria-hidden="true" />
              {t('edit')}
            </Button>
          </header>
          <p className="mt-4 flex items-start gap-2 text-sm text-foreground">
            <MapPin
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>{fullAddress || t('addressMissing')}</span>
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {property.location?.latitude != null &&
            property.location?.longitude != null
              ? `${property.location.latitude.toFixed(5)}, ${property.location.longitude.toFixed(5)}`
              : t('gpsMissing')}
          </p>
        </section>

        <section className="rounded-xl bg-card p-6">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">{t('todo')}</h2>
              <p className="text-xs text-muted-foreground">
                {remaining.length === 0
                  ? t('allDone')
                  : t('remaining', { count: remaining.length })}
              </p>
            </div>
          </header>
          <ul className="mt-4 space-y-2">
            {checklist.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span
                  className={
                    item.done ? 'text-muted-foreground line-through' : 'text-foreground'
                  }
                >
                  {item.done ? '✓ ' : '○ '}
                  {t(item.labelKey)}
                </span>
                {!item.done ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onJumpTo(item.target)}
                  >
                    {t('complete')}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl bg-card p-6">
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {t('priceHistory')}
            </h2>
            <p className="text-xs text-muted-foreground">{t('priceHistoryHint')}</p>
          </div>
          {property.price_history && property.price_history.length > 5 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onJumpTo('history')}
            >
              {t('seeAll')}
              <ArrowRight aria-hidden="true" />
            </Button>
          ) : null}
        </header>
        {recentPrices.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">{t('noPriceHistory')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-muted text-sm">
            {recentPrices.map((entry) => (
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
          </ul>
        )}
      </section>
    </div>
  );
}
