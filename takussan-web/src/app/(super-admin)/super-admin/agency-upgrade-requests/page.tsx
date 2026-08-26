'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DataState,
  DataTable,
  FilterBar,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { Button, buttonVariants } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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

/**
 * Le statut de la demande → le ton du DS. Les quatre couleurs Tailwind faites main
 * (`bg-amber-100`, `bg-emerald-100`, `bg-red-100`, `bg-stone-200`) sont devenues quatre SENS ;
 * la couleur se décide une fois, dans `StatusBadge`.
 */
const STATUS_TONES: Record<AgencyUpgradeRequestStatus, StatusTone> = {
  pending: 'attention',
  approved: 'success',
  rejected: 'danger',
  revoked: 'neutral',
};

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

  const columns: DataTableColumn<AdminAgencyUpgradeRequestRow>[] = [
    {
      id: 'agency',
      header: t('columns.agency'),
      cell: (row) => <UpgradeRequestAgencyCell row={row} />,
    },
    {
      id: 'submittedBy',
      header: t('columns.submittedBy'),
      className: 'text-muted-foreground',
      cell: (row) => <UpgradeRequestSubmitterCell row={row} />,
    },
    {
      id: 'date',
      header: t('columns.date'),
      className: 'text-muted-foreground',
      cell: (row) => formatDateTime(row.submitted_at),
    },
    {
      id: 'status',
      header: t('columns.status'),
      cell: (row) => (
        <StatusBadge tone={STATUS_TONES[row.status]} label={t(`status.${row.status}`)} />
      ),
    },
    {
      id: 'delay',
      header: t('columns.delay'),
      className: 'text-muted-foreground',
      cell: (row) => <UpgradeRequestDelayCell submittedAt={row.submitted_at} now={now} />,
    },
    {
      id: 'actions',
      header: t('review'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => (
        <Link
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={`/super-admin/agency-upgrade-requests/${row.id}`}
        >
          {t('review')}
          <ArrowUpRight className="ml-1 size-3.5" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t.rich('subtitle', { code: (chunks) => <code>{chunks}</code> })}
      />

      <FilterBar
        controlsClassName="grid-cols-1 sm:grid-cols-3 md:grid-cols-3 xl:grid-cols-3"
        resultCount={t('totalRequests', { total: String(meta?.total ?? '—') })}
      >
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
      </FilterBar>

      <section className="space-y-3">
        <h2 className="font-display text-lg font-semibold text-foreground">{t('listTitle')}</h2>

        <DataState
          loading={query.isLoading}
          error={query.isError ? t('loadError') : null}
          isEmpty={rows.length === 0}
          skeletonRows={4}
          emptyState={
            <EmptyState
              icon={<Building2 className="size-8" aria-hidden="true" />}
              title={t('empty')}
            />
          }
        >
          <DataTable
            caption={t('tableCaption')}
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
          />
        </DataState>

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
      </section>
    </div>
  );
}

/**
 * Les trois cellules composées sont des composants et non des fonctions en ligne parce qu'elles
 * ont besoin d'un HOOK (`useTranslations`) : l'appeler depuis la `cell` d'une colonne, qui est un
 * callback, violerait les règles des hooks.
 */
function UpgradeRequestAgencyCell({ row }: { readonly row: AdminAgencyUpgradeRequestRow }) {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  return (
    <div className="flex items-center gap-2">
      <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
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
  );
}

function UpgradeRequestSubmitterCell({ row }: { readonly row: AdminAgencyUpgradeRequestRow }) {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  if (!row.submitter) {
    return <span className="text-xs">{t('userFallback', { id: String(row.submitted_by) })}</span>;
  }
  return (
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
  );
}

function UpgradeRequestDelayCell({
  submittedAt,
  now,
}: {
  readonly submittedAt: string | null;
  readonly now: number;
}) {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  const elapsedDays = elapsedDaysSince(submittedAt, now);
  if (elapsedDays === null) return <>—</>;
  if (elapsedDays === 0) return <>{t('delay.today')}</>;
  if (elapsedDays === 1) return <>{t('delay.oneDay')}</>;
  return <>{t('delay.days', { count: String(elapsedDays) })}</>;
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
