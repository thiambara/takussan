'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Wrench } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  MaintenancePriorityBadge,
  MaintenanceStatusBadge,
} from './MaintenanceStatusBadge';

/**
 * Dashboard list view for maintenance requests. Server-side filtering is
 * enforced (CLAUDE.md rule #2 — never filter client-side on a fetched list).
 */
export function MaintenanceList() {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.list');
  const tStatus = useTranslations('maintenance.status');
  const tPriority = useTranslations('maintenance.priority');
  const tCategory = useTranslations('maintenance.category');
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
            {t('status_label')}
          </label>
          <Select
            value={status || '__all__'}
            onValueChange={(value) => setStatus(value === '__all__' ? '' : ((value ?? '') as '' | MaintenanceStatus))}
            items={[
              { value: '__all__', label: t('all_statuses') },
              ...MAINTENANCE_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
            ]}
          >
            <SelectTrigger id="maintenance-filter-status" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('all_statuses')}</SelectItem>
              {MAINTENANCE_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{tStatus(s)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex w-56 flex-col">
          <label htmlFor="maintenance-filter-priority" className="mb-1.5 text-sm font-medium">
            {t('priority_label')}
          </label>
          <Select
            value={priority || '__all__'}
            onValueChange={(value) => setPriority(value === '__all__' ? '' : ((value ?? '') as '' | MaintenancePriority))}
            items={[
              { value: '__all__', label: t('all_priorities') },
              ...MAINTENANCE_PRIORITIES.map((p) => ({ value: p, label: tPriority(p) })),
            ]}
          >
            <SelectTrigger id="maintenance-filter-priority" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('all_priorities')}</SelectItem>
              {MAINTENANCE_PRIORITIES.map((p) => (
                <SelectItem key={p} value={p}>{tPriority(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="ml-auto">
          <Link
            href="/app/maintenance/new"
            className={buttonVariants({ variant: 'default' })}
          >
            {t('new_request')}
          </Link>
        </div>
      </div>

      <QueryBoundary query={query}>
        {(data) => {
          if (data.data.length === 0) {
            return (
              <EmptyState
                icon={<Wrench className="size-8" aria-hidden="true" />}
                title={t('empty_title')}
                description={t('empty_description')}
                action={
                  <Link href="/app/maintenance/new" className={buttonVariants()}>
                    {t('empty_cta')}
                  </Link>
                }
              />
            );
          }

          const urgentRequests = data.data.filter((r) => r.priority === 'urgent');
          const otherRequests = data.data.filter((r) => r.priority !== 'urgent');

          const renderList = (requests: typeof data.data) => (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li
                  key={request.id}
                  className="rounded-xl bg-card shadow-sm transition-colors hover:bg-muted"
                >
                  <Link
                    href={`/app/maintenance/${request.id}`}
                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {request.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {tCategory(request.category)} ·{' '}
                        {formatDate(request.created_at, locale, { dateStyle: 'medium' })}
                        {request.scheduled_at
                          ? ` · ${t('scheduled', {
                              date: formatDate(request.scheduled_at, locale, {
                                dateStyle: 'short',
                              }),
                            })}`
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
                  <h2 className="text-sm font-bold uppercase tracking-wider text-destructive dark:text-destructive">
                    {t('urgent_heading')}
                  </h2>
                  {renderList(urgentRequests)}
                </div>
              )}
              
              {otherRequests.length > 0 && (
                <div className="space-y-3">
                  {urgentRequests.length > 0 && (
                    <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      {t('other_heading')}
                    </h2>
                  )}
                  {renderList(otherRequests)}
                </div>
              )}

              {data.meta.last_page > 1 ? (
                <div className="pt-3 text-center text-xs text-muted-foreground">
                  {t('pagination', {
                    current: data.meta.current_page,
                    last: data.meta.last_page,
                    total: data.meta.total,
                  })}
                </div>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
