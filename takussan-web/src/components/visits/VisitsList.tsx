'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CalendarClock } from 'lucide-react';
import { useVisits } from '@/lib/queries/visits';
import { formatDateTime } from '@/lib/format';
import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PropertyVisit, VisitStatus, VisitType } from '@/types/visit';
import type { Locale } from '@/i18n/config';

/**
 * TCK-292 — tables hors composant : elles transportent la CLÉ (relative au namespace `visits`),
 * le rendu la résout. Patron posé par TCK-286 dans `data/navigation.ts`.
 */
const STATUS_LABEL_KEY: Record<VisitStatus, string> = {
  scheduled: 'status.scheduled',
  confirmed: 'status.confirmed',
  completed: 'status.completed',
  cancelled: 'status.cancelled',
  no_show: 'status.no_show',
};

const STATUS_VARIANT: Record<VisitStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'outline',
  confirmed: 'default',
  completed: 'default',
  cancelled: 'secondary',
  no_show: 'destructive',
};

const TYPE_LABEL_KEY: Record<VisitType, string> = {
  in_person: 'type.in_person',
  virtual: 'type.virtual',
  self_guided: 'type.self_guided',
  hybrid: 'type.hybrid',
};

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
      <TabsList>
        {tabs.map((t) => (
          <TabsTrigger key={t.value} value={t.value}>
            {t.label}
            {typeof t.query.data?.meta?.total === 'number' && (
              <span className="ml-1.5 text-xs text-stone-500">({t.query.data.meta.total})</span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>

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
      loadingFallback={[0, 1, 2].map((i) => (
        <div key={i} className="h-20 animate-pulse rounded-xl bg-card" />
      ))}
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
        className="block rounded-xl border border-stone-200 bg-white p-4 transition-shadow hover:shadow-sm"
      >
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-stone-900">
                {visit.property?.title ?? t('fallbackTitle', { id: String(visit.id) })}
              </h3>
              <Badge variant={STATUS_VARIANT[status]}>{t(STATUS_LABEL_KEY[status])}</Badge>
              <Badge variant="outline">{t(TYPE_LABEL_KEY[type])}</Badge>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {formatDateTime(visit.scheduled_at, locale)}
              {typeof visit.duration_minutes === 'number' && visit.duration_minutes > 0 && (
                <> · {visit.duration_minutes} {t('minutesUnit')}</>
              )}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
