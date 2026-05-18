'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';
import { useVisits } from '@/lib/queries/visits';
import { formatDateTime } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { PropertyVisit, VisitStatus, VisitType } from '@/types/visit';
import type { Locale } from '@/i18n/config';

const STATUS_LABEL: Record<VisitStatus, string> = {
  scheduled: 'Demandée',
  confirmed: 'Confirmée',
  completed: 'Terminée',
  cancelled: 'Annulée',
  no_show: 'Absence',
};

const STATUS_VARIANT: Record<VisitStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  scheduled: 'outline',
  confirmed: 'default',
  completed: 'default',
  cancelled: 'secondary',
  no_show: 'destructive',
};

const TYPE_LABEL: Record<VisitType, string> = {
  in_person: 'En personne',
  virtual: 'Virtuelle',
  self_guided: 'Autonome',
  hybrid: 'Hybride',
};

type TabKey = 'requested' | 'confirmed' | 'past' | 'cancelled';

/**
 * TCK-171 — 4 tabs: Demandées / Confirmées / Passées / Annulées.
 * Filtering is server-side via spatie filters.
 */
export function VisitsList() {
  const locale = useLocale() as Locale;
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

  const tabs: ReadonlyArray<{ value: TabKey; label: string; query: ReturnType<typeof useVisits>; emptyLabel: string }> = [
    { value: 'requested', label: 'Demandées', query: requested, emptyLabel: 'Aucune visite demandée.' },
    { value: 'confirmed', label: 'Confirmées', query: confirmed, emptyLabel: 'Aucune visite confirmée.' },
    { value: 'past', label: 'Passées', query: past, emptyLabel: 'Aucune visite passée.' },
    { value: 'cancelled', label: 'Annulées', query: cancelled, emptyLabel: 'Aucune visite annulée.' },
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
          <VisitsListBody query={t.query} locale={locale} emptyLabel={t.emptyLabel} />
        </TabsContent>
      ))}
    </Tabs>
  );
}

type QueryLike = ReturnType<typeof useVisits>;

function VisitsListBody({
  query,
  locale,
  emptyLabel,
}: {
  query: QueryLike;
  locale: Locale;
  emptyLabel: string;
}) {
  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-app-surface-1" />
        ))}
      </div>
    );
  }

  if (query.isError) {
    return (
      <p className="rounded-xl bg-app-surface-1 p-6 text-sm text-red-600">
        Impossible de charger vos visites.
      </p>
    );
  }

  const visits = query.data?.data ?? [];
  if (visits.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
        {emptyLabel}
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {visits.map((visit) => (
        <VisitRow key={visit.id} visit={visit} locale={locale} />
      ))}
    </ul>
  );
}

function VisitRow({ visit, locale }: { visit: PropertyVisit; locale: Locale }) {
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
                {visit.property?.title ?? `Visite #${visit.id}`}
              </h3>
              <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
              <Badge variant="outline">{TYPE_LABEL[type]}</Badge>
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {formatDateTime(visit.scheduled_at, locale)}
              {typeof visit.duration_minutes === 'number' && visit.duration_minutes > 0 && (
                <> · {visit.duration_minutes} min</>
              )}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}
