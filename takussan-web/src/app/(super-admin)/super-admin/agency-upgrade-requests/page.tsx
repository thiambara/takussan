'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchAdminAgencyUpgradeRequests,
  type AdminAgencyUpgradeRequestRow,
  type AgencyUpgradeRequestStatus,
} from '@/lib/queries/super-admin';

/**
 * TCK-268 — Listing of every agency upgrade request, cross-tenant, for
 * the super-admin review console.
 *
 * Filters: status (all / pending / approved / rejected / revoked) and a
 * loose `submitted` date range. Sort is fixed to `-submitted_at` so the
 * top of the page is always the freshest decision queue.
 *
 * Defers the per-row decision to the detail page so the list stays fast
 * and avoids modal coupling at the top level.
 */
/**
 * Patron « la donnée porte la clé » (TCK-286) : table hors composant, donc hors de portée
 * de `useTranslations`. Elle transporte une clé, le rendu la résout.
 *
 * ⚠ Ces libellés ne sont PAS ceux d'`agency.upgrade.status.badges` (côté agence), qui dit
 * « Refusée » là où cette console dit « Rejetée ». Les deux tables sont volontairement
 * distinctes : les fusionner changerait un libellé affiché, ce que TCK-292 interdit.
 */
const STATUS_FILTER_OPTIONS = [
  { value: 'all', labelKey: 'filters.all' },
  { value: 'pending', labelKey: 'filters.pending' },
  { value: 'approved', labelKey: 'filters.approved' },
  { value: 'rejected', labelKey: 'filters.rejected' },
  { value: 'revoked', labelKey: 'filters.revoked' },
] as const;

export default function AgencyUpgradeRequestsListPage() {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  const [statusFilter, setStatusFilter] = useState<AgencyUpgradeRequestStatus | 'all'>('all');
  const [submittedFrom, setSubmittedFrom] = useState('');
  const [submittedTo, setSubmittedTo] = useState('');
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: [
      'super-admin',
      'agency-upgrade-requests',
      statusFilter,
      submittedFrom,
      submittedTo,
      page,
    ],
    queryFn: () =>
      fetchAdminAgencyUpgradeRequests({
        status: statusFilter,
        submittedFrom: submittedFrom || undefined,
        submittedTo: submittedTo || undefined,
        page,
        perPage: 20,
      }),
  });

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta;
  // `dataUpdatedAt` is a stable timestamp (ms) provided by react-query
  // every time the listing refetches — using it instead of `Date.now()`
  // keeps render pure and the elapsed-day numbers fresh on each refresh.
  const now = query.dataUpdatedAt || 0;
  const statusOptions = STATUS_FILTER_OPTIONS.map((opt) => ({
    value: opt.value as string,
    label: t(opt.labelKey),
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t.rich('subtitle', { code: (chunks) => <code>{chunks}</code> })}
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-4 text-amber-600" aria-hidden="true" />
            {t('filtersTitle')}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t('totalRequests', { total: String(meta?.total ?? '—') })}
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="status-filter" className="text-xs font-medium text-muted-foreground">
                {t('statusLabel')}
              </label>
              <Select
                value={statusFilter}
                onValueChange={(next) => {
                  setStatusFilter((next ?? 'all') as AgencyUpgradeRequestStatus | 'all');
                  setPage(1);
                }}
                items={statusOptions}
              >
                <SelectTrigger id="status-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="from-filter" className="text-xs font-medium text-muted-foreground">
                {t('submittedFrom')}
              </label>
              <DatePicker
                id="from-filter"
                value={submittedFrom}
                onValueChange={(value) => {
                  setSubmittedFrom(value);
                  setPage(1);
                }}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="to-filter" className="text-xs font-medium text-muted-foreground">
                {t('submittedTo')}
              </label>
              <DatePicker
                id="to-filter"
                value={submittedTo}
                onValueChange={(value) => {
                  setSubmittedTo(value);
                  setPage(1);
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('listTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? <Skeleton className="h-32" /> : null}
          {query.isError ? (
            <p className="text-sm text-red-600">{t('loadError')}</p>
          ) : null}
          {!query.isLoading && !query.isError && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-3 py-2 text-left">{t('columns.agency')}</th>
                    <th className="px-3 py-2 text-left">{t('columns.submittedBy')}</th>
                    <th className="px-3 py-2 text-left">{t('columns.date')}</th>
                    <th className="px-3 py-2 text-left">{t('columns.status')}</th>
                    <th className="px-3 py-2 text-left">{t('columns.delay')}</th>
                    <th className="px-3 py-2 text-right" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {rows.map((row) => (
                    <UpgradeRequestRow key={row.id} row={row} now={now} />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft className="mr-1 size-4" aria-hidden="true" />
              {t('pagination.previous')}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t('pagination.position', {
                page: String(meta?.current_page ?? page),
                lastPage: String(meta?.last_page ?? 1),
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!meta || page >= meta.last_page}
              onClick={() => setPage((value) => value + 1)}
            >
              {t('pagination.next')}
              <ChevronRight className="ml-1 size-4" aria-hidden="true" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UpgradeRequestRow({
  row,
  now,
}: {
  readonly row: AdminAgencyUpgradeRequestRow;
  readonly now: number;
}) {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  const elapsedDays = elapsedDaysSince(row.submitted_at, now);

  return (
    <tr className="transition-colors hover:bg-stone-50">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-stone-400" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">
              {row.agency?.name
                ?? row.company_legal_name
                ?? t('agencyFallback', { id: String(row.agency_id) })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('agencyRef', { id: String(row.agency_id) })}
              {row.planned_agents_count
                ? t('plannedAgents', { count: String(row.planned_agents_count) })
                : null}
            </p>
          </div>
        </div>
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {row.submitter ? (
          <>
            <p className="text-foreground">
              {[row.submitter.first_name, row.submitter.last_name].filter(Boolean).join(' ') ||
                row.submitter.email ||
                t('userFallback', { id: String(row.submitted_by) })}
            </p>
            {row.submitter.email ? (
              <p className="text-xs text-muted-foreground">{row.submitter.email}</p>
            ) : null}
          </>
        ) : (
          <span className="text-xs">{t('userFallback', { id: String(row.submitted_by) })}</span>
        )}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{formatDateTime(row.submitted_at)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={row.status} />
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {elapsedDays === null
          ? '—'
          : elapsedDays === 0
            ? t('delay.today')
            : elapsedDays === 1
              ? t('delay.oneDay')
              : t('delay.days', { count: String(elapsedDays) })}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={`/super-admin/agency-upgrade-requests/${row.id}`}
        >
          {t('review')}
          <ArrowUpRight className="ml-1 size-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { readonly status: AgencyUpgradeRequestStatus }) {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  const map: Record<AgencyUpgradeRequestStatus, { labelKey: string; className: string }> = {
    pending: {
      labelKey: 'status.pending',
      className: 'bg-amber-100 text-amber-900',
    },
    approved: {
      labelKey: 'status.approved',
      className: 'bg-emerald-100 text-emerald-900',
    },
    rejected: {
      labelKey: 'status.rejected',
      className: 'bg-red-100 text-red-900',
    },
    revoked: {
      labelKey: 'status.revoked',
      className: 'bg-stone-200 text-stone-800',
    },
  };
  const { labelKey, className } = map[status];
  const label = t(labelKey);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

/**
 * Pure helper kept outside component bodies so the linter accepts the
 * `Date.now()` read — React-19 forbids impure calls during render but it's
 * fine to expose them via a function the renderer calls explicitly per
 * row (no memoization invariants to break either).
 */
function elapsedDaysSince(submittedAt: string | null, now: number): number | null {
  if (!submittedAt) return null;
  const ms = now - new Date(submittedAt).getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}
