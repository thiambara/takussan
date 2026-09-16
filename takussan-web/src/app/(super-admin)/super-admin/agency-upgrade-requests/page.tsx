'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { useTranslations } from 'next-intl';

import {
  DataState,
  DataTable,
  FilterBar,
  PageHeader,
  Pagination,
  StatusBadge,
  type DataTableColumn,
  type StatusTone,
} from '@/components/console';
import { EmptyState } from '@/components/feedback';
import { buttonVariants } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFormatteurs } from '@/lib/format/useFormatteurs';
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
 * (ambre 100, émeraude 100, rouge 100, pierre 200) sont devenues quatre SENS ;
 * la couleur se décide une fois, dans `StatusBadge`.
 */
const STATUS_TONES: Record<AgencyUpgradeRequestStatus, StatusTone> = {
  pending: 'attention',
  approved: 'success',
  rejected: 'danger',
  revoked: 'neutral',
};

/** Un `?status=` inconnu retombe sur « toutes » plutôt que de filtrer sur une valeur absente. */
function seedStatusFilter(value: string | null | undefined): AgencyUpgradeRequestStatus | 'all' {
  const known = STATUS_FILTER_OPTIONS.some((option) => option.value === value);
  return known ? (value as AgencyUpgradeRequestStatus | 'all') : 'all';
}

export default function AgencyUpgradeRequestsListPage() {
  const t = useTranslations('superAdmin.pages.upgradeRequests');
  const tFiltres = useTranslations('console.filterBar');
  const fmt = useFormatteurs();
  const searchParams = useSearchParams();
  // TCK-360 — la file « demandes d'upgrade » de l'accueil compte les `pending` ; le lien porte
  // donc `?status=pending`, faute de quoi le clic mènerait à « toutes » et le compte affiché ne
  // serait pas celui qu'on trouve en arrivant. Amorce seule : le filtre reste local ensuite.
  const [statusFilter, setStatusFilter] = useState<AgencyUpgradeRequestStatus | 'all'>(
    () => seedStatusFilter(searchParams?.get('status')),
  );
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
      cell: (row) => (
        <div className="flex items-center gap-2">
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          {/* Le nom mène à la fiche : sur mobile, « Examiner » vit au bout d'une table qui défile. */}
          <div className="min-w-40">
            <Link
              href={`/super-admin/agency-upgrade-requests/${row.id}`}
              className="rounded-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.agency?.name
                ?? row.company_legal_name
                ?? t('agencyFallback', { id: String(row.agency_id) })}
            </Link>
            <p className="text-xs text-muted-foreground">
              {t('agencyRef', { id: String(row.agency_id) })}
              {row.planned_agents_count
                ? t('plannedAgents', { count: String(row.planned_agents_count) })
                : null}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'submittedBy',
      header: t('columns.submittedBy'),
      className: 'text-muted-foreground',
      cell: (row) =>
        row.submitter ? (
          <>
            <p className="text-foreground">
              {[row.submitter.first_name, row.submitter.last_name].filter(Boolean).join(' ')
                || row.submitter.email
                || t('userFallback', { id: String(row.submitted_by) })}
            </p>
            {row.submitter.email ? (
              <p className="text-xs text-muted-foreground">{row.submitter.email}</p>
            ) : null}
          </>
        ) : (
          <span className="text-xs">{t('userFallback', { id: String(row.submitted_by) })}</span>
        ),
    },
    {
      id: 'date',
      header: t('columns.date'),
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (row) => fmt.dateTime(row.submitted_at),
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
      className: 'whitespace-nowrap tabular-nums text-muted-foreground',
      cell: (row) => formatElapsed(elapsedDaysSince(row.submitted_at, now), t),
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
          <ArrowUpRight className="size-3.5" aria-hidden="true" />
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
        // Trois colonnes dès `lg` : `md` n'offre que 464 px dans la coque (TCK-505).
        controlsClassName="md:grid-cols-1 lg:grid-cols-3"
        // Le compte passe par le pluriel ICU de la barre : « 1 demandes » n'accordait pas.
        resultCount={meta ? tFiltres('results', { count: meta.total }) : undefined}
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

        {meta ? (
          <Pagination page={meta.current_page} lastPage={meta.last_page} onChange={setPage} />
        ) : null}
      </section>
    </div>
  );
}

/**
 * Les cellules sont des fonctions PURES, pas des composants.
 *
 * Le `t` dont elles ont besoin est celui de la page — même espace de noms, déjà en portée : rien
 * ici n'appelle de hook, donc rien n'oblige à traverser une frontière de composant. Un composant
 * par cellule aurait payé un `useTranslations` par cellule ET par ligne.
 */
function formatElapsed(
  elapsedDays: number | null,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (elapsedDays === null) return '—';
  if (elapsedDays === 0) return t('delay.today');
  if (elapsedDays === 1) return t('delay.oneDay');
  return t('delay.days', { count: String(elapsedDays) });
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
