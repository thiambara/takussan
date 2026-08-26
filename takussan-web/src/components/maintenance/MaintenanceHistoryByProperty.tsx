'use client';

import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useMaintenanceHistoryForProperty } from '@/lib/queries/maintenance';

import {
  MaintenancePriorityBadge,
  MaintenanceStatusBadge,
} from './MaintenanceStatusBadge';

/**
 * Reusable history timeline — powered by
 * `GET /api/properties/{property}/maintenance-requests`. Embeddable on a
 * property detail page (future wave) or on a dedicated tab.
 */
export function MaintenanceHistoryByProperty({
  propertyId,
}: {
  readonly propertyId: number;
}) {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.history');
  const tCategory = useTranslations('maintenance.category');
  const query = useMaintenanceHistoryForProperty(propertyId);

  return (
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
        );
      }}
    </QueryBoundary>
  );
}
