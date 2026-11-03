'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, Wrench } from 'lucide-react';

import { EmptyState } from '@/components/feedback';
import { QueryBoundary } from '@/components/shared/QueryBoundary';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import { getPrimaryRole } from '@/lib/roles';
import type { Locale } from '@/i18n/config';
import {
  useMaintenanceRequests,
  type MaintenanceListParams,
} from '@/lib/queries/maintenance';
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  parseMaintenanceStatuses,
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
 *
 * TCK-592 (P14, P17) — « Mes interventions » du prestataire : triée par créneau (côté serveur),
 * avec le quartier et l'agence du bien. « Nouvelle demande » ne s'affiche que si l'API dit qu'elle
 * mène quelque part (`meta.abilities.can_create`) : le prestataire prenait un 403 en la suivant.
 */
export function MaintenanceList() {
  const locale = useLocale() as Locale;
  const t = useTranslations('maintenance.list');
  const tStatus = useTranslations('maintenance.status');
  const tPriority = useTranslations('maintenance.priority');
  const tCategory = useTranslations('maintenance.category');
  const tIntervention = useTranslations('maintenance.intervention.list');
  const { user } = useAuth();
  const isProvider = user ? getPrimaryRole(user.roles) === 'service_provider' : false;
  // TCK-1727 (P167.01) — `?status=a,b` ouvre la liste sur ces statuts : les aperçus y mènent avec
  // ce que leur nombre compte. Lu au montage ; le sélecteur le remplace ensuite.
  const searchParams = useSearchParams();
  const [statuses, setStatuses] = useState<readonly MaintenanceStatus[]>(() =>
    parseMaintenanceStatuses(searchParams?.get('status')),
  );
  const statusValue = statuses.length ? statuses.join(',') : '__all__';
  const statusOptions = [
    { value: '__all__', label: t('all_statuses') },
    // Une valeur à plusieurs statuts se nomme par leurs libellés joints, sans clé neuve.
    ...(statuses.length > 1 ? [{ value: statusValue, label: statuses.map((s) => tStatus(s)).join(', ') }] : []),
    ...MAINTENANCE_STATUSES.map((s) => ({ value: s, label: tStatus(s) })),
  ];
  const [priority, setPriority] = useState<'' | MaintenancePriority>('');
  // La liste annonçait « Page 1 / N » sans aucun moyen d'atteindre la page 2.
  const [page, setPage] = useState(1);

  const params = useMemo<MaintenanceListParams>(() => ({
    ...(statuses.length ? { status: statuses } : {}),
    ...(priority ? { priority } : {}),
    ...(isProvider ? { sort: 'scheduled_at' } : {}),
    page,
  }), [statuses, priority, page, isProvider]);

  const query = useMaintenanceRequests(params);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-36 flex-col sm:w-56 sm:flex-none">
          <label htmlFor="maintenance-filter-status" className="mb-1.5 text-sm font-medium">
            {t('status_label')}
          </label>
          <Select
            value={statusValue}
            onValueChange={(value) => {
              setStatuses(!value || value === '__all__' ? [] : parseMaintenanceStatuses(value));
              setPage(1);
            }}
            items={statusOptions}
          >
            <SelectTrigger id="maintenance-filter-status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 basis-36 flex-col sm:w-56 sm:flex-none">
          <label htmlFor="maintenance-filter-priority" className="mb-1.5 text-sm font-medium">
            {t('priority_label')}
          </label>
          <Select
            value={priority || '__all__'}
            onValueChange={(value) => {
              setPriority(value === '__all__' ? '' : ((value ?? '') as '' | MaintenancePriority));
              setPage(1);
            }}
            items={[
              { value: '__all__', label: t('all_priorities') },
              ...MAINTENANCE_PRIORITIES.map((p) => ({ value: p, label: tPriority(p) })),
            ]}
          >
            <SelectTrigger id="maintenance-filter-priority" className="w-full">
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
        {query.data?.meta.abilities?.can_create ? (
          <div className="w-full sm:ml-auto sm:w-auto">
            <Link
              href="/app/maintenance/new"
              className={buttonVariants({ variant: 'default', className: 'h-9 w-full sm:w-auto' })}
            >
              {t('new_request')}
            </Link>
          </div>
        ) : null}
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
                  data.meta.abilities?.can_create ? (
                    <Link href="/app/maintenance/new" className={buttonVariants()}>
                      {t('empty_cta')}
                    </Link>
                  ) : undefined
                }
              />
            );
          }

          // P199.04 (TCK-2167) — le prestataire lit sa liste triée par créneau : une urgence planifiée
          // tard est sur une autre page. La section des urgences ne se rend que quand la liste tient
          // sur une page ; sinon chaque urgence reste à sa place, avec son badge. Les autres rôles
          // reçoivent la liste triée par priorité (`-priority`, côté serveur) : inchangé.
          const separerUrgences = !isProvider || data.meta.last_page <= 1;
          const urgentRequests = separerUrgences ? data.data.filter((r) => r.priority === 'urgent') : [];
          const otherRequests = separerUrgences ? data.data.filter((r) => r.priority !== 'urgent') : data.data;

          const renderList = (requests: typeof data.data) => (
            <ul className="space-y-2">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/app/maintenance/${request.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-[box-shadow,border-color] hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {request.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                        {tCategory(request.category)} ·{' '}
                        {formatDate(request.created_at, locale, { dateStyle: 'medium' })}
                        {request.scheduled_at
                          ? ` · ${t('scheduled', {
                              date: formatDate(request.scheduled_at, locale, {
                                dateStyle: 'medium',
                              }),
                            })}`
                          : null}
                      </p>
                      {request.property ? (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {[
                            request.property.title,
                            request.property.location?.quarter,
                            request.property.agency?.name
                              ? tIntervention('agency', { name: request.property.agency.name })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-destructive">
                    {t('urgent_heading')}
                  </h2>
                  {renderList(urgentRequests)}
                </div>
              )}

              {otherRequests.length > 0 && (
                <div className="space-y-3">
                  {urgentRequests.length > 0 && (
                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {t('other_heading')}
                    </h2>
                  )}
                  {renderList(otherRequests)}
                </div>
              )}

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
                    {t('previous')}
                  </Button>
                  <span className="text-center text-xs text-muted-foreground tabular-nums">
                    {t('pagination', {
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
                    {t('next')}
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
