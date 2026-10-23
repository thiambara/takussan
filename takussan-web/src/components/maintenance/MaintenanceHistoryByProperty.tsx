'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useMaintenanceHistoryForProperty } from '@/lib/queries/maintenance';

import {
  MaintenancePriorityBadge,
  MaintenanceStatusBadge,
} from './MaintenanceStatusBadge';

/**
 * L'historique des interventions d'un bien — `GET /api/properties/{property}/maintenance-requests`,
 * borné par l'API au périmètre de lecture de l'appelant.
 *
 * TCK-2009 (P171.08) — monté sous l'onglet « Historique » de la fiche du bien (il n'avait aucun
 * appelant), et paginé comme `MaintenanceList` : une seule page taisait les suivantes.
 */
export function MaintenanceHistoryByProperty({
  propertyId,
}: {
  readonly propertyId: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.history');
  const tList = useTranslations('maintenance.list');
  const tCategory = useTranslations('maintenance.category');
  const [page, setPage] = useState(1);
  const query = useMaintenanceHistoryForProperty(propertyId, { page });

  return (
    <section className="space-y-3">
      <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
      <QueryBoundary query={query}>
        {(data) => {
          if (data.data.length === 0) {
            return (
              <EmptyState
                icon={<Wrench className="size-8" aria-hidden="true" />}
                title={t('empty_title')}
                description={t('empty_description')}
              />
            );
          }
          return (
            <div className="space-y-3">
              <ul className="space-y-2">
                {data.data.map((r) => (
                  <li key={r.id} className="rounded-xl bg-card p-4 shadow-sm">
                    <Link
                      href={`/app/maintenance/${r.id}`}
                      className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {tCategory(r.category)} ·{' '}
                          {formatDate(r.created_at, locale)}
                          {r.completed_at
                            ? ` · ${t('completed_at', {
                                date: formatDate(r.completed_at, locale),
                              })}`
                            : null}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MaintenancePriorityBadge priority={r.priority} />
                        <MaintenanceStatusBadge status={r.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              {data.meta.last_page > 1 ? (
                <div className="flex items-center justify-between gap-3 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.meta.current_page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft aria-hidden="true" />
                    {tList('previous')}
                  </Button>
                  <span className="text-center text-xs text-muted-foreground tabular-nums">
                    {tList('pagination', {
                      current: data.meta.current_page,
                      last: data.meta.last_page,
                      total: data.meta.total,
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.meta.current_page >= data.meta.last_page}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    {tList('next')}
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </section>
  );
}
