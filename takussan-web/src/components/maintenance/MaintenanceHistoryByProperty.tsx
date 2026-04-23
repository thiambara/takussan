'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';

import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import { useMaintenanceHistoryForProperty } from '@/lib/queries/maintenance';

import { MAINTENANCE_CATEGORY_LABEL } from './labels';
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
  const query = useMaintenanceHistoryForProperty(propertyId);

  return (
    <QueryBoundary query={query}>
      {(data) => {
        if (data.data.length === 0) {
          return (
            <p className="rounded-xl bg-app-surface-1 p-6 text-center text-sm text-app-ink-muted">
              Aucune intervention enregistrée sur ce bien.
            </p>
          );
        }
        return (
          <ul className="space-y-2">
            {data.data.map((r) => (
              <li key={r.id} className="rounded-xl bg-app-surface-1 p-4 shadow-sm">
                <Link
                  href={`/app/maintenance/${r.id}`}
                  className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-app-ink">{r.title}</p>
                    <p className="text-xs text-app-ink-muted">
                      {MAINTENANCE_CATEGORY_LABEL[r.category]} ·{' '}
                      {formatDate(r.created_at, locale)}
                      {r.completed_at
                        ? ` · Terminée le ${formatDate(r.completed_at, locale)}`
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
