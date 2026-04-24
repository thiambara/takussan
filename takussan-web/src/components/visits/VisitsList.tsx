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

/**
 * TCK-075 — Dashboard list of visits with "À venir" / "Passées" tabs.
 *
 * Filtering happens server-side through spatie's `filter[scheduled_at_min]`
 * / `filter[scheduled_at_max]` parameters — the frontend never slices a
 * pre-fetched array.
 */
export function VisitsList() {
  const locale = useLocale() as Locale;
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');

  const nowIso = useMemo(() => new Date().toISOString(), []);

  const upcoming = useVisits({
    scheduled_at_min: nowIso,
    sort: 'scheduled_at',
    per_page: 30,
  });

  const past = useVisits({
    scheduled_at_max: nowIso,
    sort: '-scheduled_at',
    per_page: 30,
  });

  const current = tab === 'upcoming' ? upcoming : past;

  return (
    <Tabs value={tab} onValueChange={(v) => setTab((v as 'upcoming' | 'past') ?? 'upcoming')}>
      <TabsList>
        <TabsTrigger value="upcoming">À venir</TabsTrigger>
        <TabsTrigger value="past">Passées</TabsTrigger>
      </TabsList>

      <TabsContent value="upcoming" className="mt-4">
        <VisitsListBody query={upcoming} locale={locale} emptyLabel="Aucune visite à venir." />
      </TabsContent>
      <TabsContent value="past" className="mt-4">
        <VisitsListBody query={past} locale={locale} emptyLabel="Aucune visite passée." />
      </TabsContent>

      {/* Both tabs share the same loader UI — avoid layout jumps while query refetches. */}
      {current.isLoading ? null : null}
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
