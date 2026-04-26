'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';

import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { buttonVariants } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useMaintenanceRequests,
  type MaintenanceListParams,
} from '@/lib/queries/maintenance';
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type MaintenancePriority,
  type MaintenanceStatus,
} from '@/types/maintenance';

import {
  MAINTENANCE_CATEGORY_LABEL,
  MAINTENANCE_PRIORITY_LABEL,
  MAINTENANCE_STATUS_LABEL,
} from './labels';
import {
  MaintenancePriorityBadge,
  MaintenanceStatusBadge,
} from './MaintenanceStatusBadge';

/**
 * Dashboard list view for maintenance requests. Server-side filtering is
 * enforced (CLAUDE.md rule #2 — never filter client-side on a fetched list).
 */
export function MaintenanceList() {
  const locale = useLocale() as Locale;
  const [status, setStatus] = useState<'' | MaintenanceStatus>('');
  const [priority, setPriority] = useState<'' | MaintenancePriority>('');

  const params = useMemo<MaintenanceListParams>(() => ({
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
  }), [status, priority]);

  const query = useMaintenanceRequests(params);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-56 flex-col">
          <label htmlFor="maintenance-filter-status" className="mb-1.5 text-sm font-medium">
            Statut
          </label>
          <select
            id="maintenance-filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | MaintenanceStatus)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tous les statuts</option>
            {MAINTENANCE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MAINTENANCE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex w-56 flex-col">
          <label htmlFor="maintenance-filter-priority" className="mb-1.5 text-sm font-medium">
            Priorité
          </label>
          <select
            id="maintenance-filter-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as '' | MaintenancePriority)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Toutes les priorités</option>
            {MAINTENANCE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {MAINTENANCE_PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <Link
            href="/app/maintenance/new"
            className={buttonVariants({ variant: 'default' })}
          >
            Nouvelle demande
          </Link>
        </div>
      </div>

      <QueryBoundary query={query}>
        {(data) => {
          if (data.data.length === 0) {
            return (
              <div className="rounded-2xl bg-app-surface-1 p-10 text-center">
                <p className="text-sm font-semibold text-app-ink">Aucune demande</p>
                <p className="mt-1 text-xs text-app-ink-muted">
                  Aucune demande de maintenance ne correspond à ces filtres.
                </p>
              </div>
            );
          }

          const urgentRequests = data.data.filter((r) => r.priority === 'urgent');
          const otherRequests = data.data.filter((r) => r.priority !== 'urgent');

          const renderList = (requests: typeof data.data) => (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="rounded-xl bg-app-surface-1 shadow-sm transition-colors hover:bg-app-surface-2"
                >
                  <Link
                    href={`/app/maintenance/${request.id}`}
                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-app-ink">
                        {request.title}
                      </p>
                      <p className="mt-1 text-xs text-app-ink-muted">
                        {MAINTENANCE_CATEGORY_LABEL[request.category]} ·{' '}
                        {formatDate(request.created_at, locale, { dateStyle: 'medium' })}
                        {request.scheduled_at
                          ? ` · Prévu ${formatDate(request.scheduled_at, locale, { dateStyle: 'short' })}`
                          : null}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <MaintenancePriorityBadge priority={request.priority} />
                      <MaintenanceStatusBadge status={request.status} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          );

          return (
            <div className="space-y-6">
              {urgentRequests.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Urgences prioritaires
                  </h2>
                  {renderList(urgentRequests)}
                </div>
              )}
              
              {otherRequests.length > 0 && (
                <div className="space-y-3">
                  {urgentRequests.length > 0 && (
                    <h2 className="text-sm font-bold uppercase tracking-wider text-app-ink-muted">
                      Autres demandes
                    </h2>
                  )}
                  {renderList(otherRequests)}
                </div>
              )}

              {data.meta.last_page > 1 ? (
                <div className="pt-3 text-center text-xs text-app-ink-muted">
                  Page {data.meta.current_page} / {data.meta.last_page} — {data.meta.total} demandes
                </div>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
