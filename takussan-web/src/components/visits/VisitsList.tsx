'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { useVisits } from '@/lib/queries/visits';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { StatusBadge } from '@/components/console';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PropertyVisit } from '@/types/visit';
import type { Locale } from '@/i18n/config';
import { VISIT_STATUS_LABEL_KEY, VISIT_STATUS_TONE, VISIT_TYPE_LABEL_KEY } from './visit-status';

type TabKey = 'requested' | 'confirmed' | 'past' | 'cancelled';

/**
 * TCK-171 — 4 tabs: Demandées / Confirmées / Passées / Annulées.
 * Filtering is server-side via spatie filters.
 */
export function VisitsList() {
  const locale = useLocale() as Locale;
  const t = useTranslations('visits');
  const [tab, setTab] = useState<TabKey>('requested');

  const nowIso = useMemo(() => new Date().toISOString(), []);

  const requested = useVisits({
    status: 'scheduled',
    scheduled_at_min: nowIso,
    sort: 'scheduled_at',
    per_page: 30,
  });

  const confirmed = useVisits({
    status: 'confirmed',
    scheduled_at_min: nowIso,
    sort: 'scheduled_at',
    per_page: 30,
  });

  const past = useVisits({
    scheduled_at_max: nowIso,
    sort: '-scheduled_at',
    per_page: 30,
  });

  const cancelled = useVisits({
    status: 'cancelled',
    sort: '-scheduled_at',
    per_page: 30,
  });

  const tabs: ReadonlyArray<{ value: TabKey; label: string; query: ReturnType<typeof useVisits> }> = [
    { value: 'requested', label: t('list.tabs.requested'), query: requested },
    { value: 'confirmed', label: t('list.tabs.confirmed'), query: confirmed },
    { value: 'past', label: t('list.tabs.past'), query: past },
    { value: 'cancelled', label: t('list.tabs.cancelled'), query: cancelled },
  ];

  return (
    <Tabs value={tab} onValueChange={(v) => setTab((v as TabKey) ?? 'requested')}>
      {/* Quatre onglets ne tiennent pas à 360 : la rangée défile au lieu de couper « Annulées ». */}
      <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 sm:mx-0 sm:px-0">
        <TabsList className="w-max">
          {tabs.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
              {typeof t.query.data?.meta?.total === 'number' && (
                <span className="ml-1.5 text-xs tabular-nums text-muted-foreground">
                  {t.query.data.meta.total}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {tabs.map((t) => (
        <TabsContent key={t.value} value={t.value} className="mt-4">
          <VisitsListBody query={t.query} locale={locale} tab={t.value} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

type QueryLike = ReturnType<typeof useVisits>;

function VisitsListBody({
  query,
  locale,
  tab,
}: {
  query: QueryLike;
  locale: Locale;
  tab: TabKey;
}) {
  const t = useTranslations('visits.list');

  return (
    <QueryBoundary
      query={query}
      loadingFallback={
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      }
    >
      {(data) => {
        const visits = data.data ?? [];
        if (visits.length === 0) {
          return (
            <EmptyState
              icon={<CalendarClock className="size-8" aria-hidden="true" />}
              title={t(`empty.${tab}`)}
              description={t('empty_description')}
            />
          );
        }

        return (
          <ul className="space-y-3">
            {visits.map((visit) => (
              <VisitRow key={visit.id} visit={visit} locale={locale} />
            ))}
          </ul>
        );
      }}
    </QueryBoundary>
  );
}

function VisitRow({ visit, locale }: { visit: PropertyVisit; locale: Locale }) {
  const t = useTranslations('visits');
  const status = visit.status ?? 'scheduled';
  const type = visit.type ?? 'in_person';
  return (
    <li>
      <Link
        href={`/app/visits/${visit.id}`}
        className="group flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-[border-color,box-shadow] duration-150 hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <h3 className="min-w-0 truncate text-sm font-semibold text-foreground">
              {visit.property?.title ?? t('fallbackTitle', { id: String(visit.id) })}
            </h3>
            <StatusBadge tone={VISIT_STATUS_TONE[status]} label={t(VISIT_STATUS_LABEL_KEY[status])} />
            <StatusBadge label={t(VISIT_TYPE_LABEL_KEY[type])} />
          </div>
          <p className="mt-1 text-xs tabular-nums text-muted-foreground">
            {formatDateTime(visit.scheduled_at, locale)}
            {typeof visit.duration_minutes === 'number' && visit.duration_minutes > 0 && (
              <> · {visit.duration_minutes} {t('minutesUnit')}</>
            )}
          </p>
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
