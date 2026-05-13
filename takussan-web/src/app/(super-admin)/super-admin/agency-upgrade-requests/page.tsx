'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, ChevronLeft, ChevronRight, Filter } from 'lucide-react';

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
const STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'pending', label: 'En attente' },
  { value: 'approved', label: 'Approuvées' },
  { value: 'rejected', label: 'Rejetées' },
  { value: 'revoked', label: 'Révoquées' },
] as const;

export default function AgencyUpgradeRequestsListPage() {
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Demandes d&apos;upgrade
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Revue des demandes <code>individual → standard</code>. Triées de la plus
          récente à la plus ancienne.
        </p>
      </header>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Filter className="size-4 text-amber-600" aria-hidden="true" />
            Filtres
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {meta?.total ?? '—'} demandes
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="status-filter" className="text-xs font-medium text-muted-foreground">
                Statut
              </label>
              <Select
                value={statusFilter}
                onValueChange={(next) => {
                  setStatusFilter((next ?? 'all') as AgencyUpgradeRequestStatus | 'all');
                  setPage(1);
                }}
                items={STATUS_FILTER_OPTIONS}
              >
                <SelectTrigger id="status-filter" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_FILTER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label htmlFor="from-filter" className="text-xs font-medium text-muted-foreground">
                Soumise depuis
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
                Soumise jusqu&apos;à
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
          <CardTitle>Demandes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {query.isLoading ? <Skeleton className="h-32" /> : null}
          {query.isError ? (
            <p className="text-sm text-red-600">
              Impossible de charger les demandes pour le moment.
            </p>
          ) : null}
          {!query.isLoading && !query.isError && rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune demande ne correspond aux filtres.
            </p>
          ) : null}

          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Agence</th>
                    <th className="px-3 py-2 text-left">Soumis par</th>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-left">Délai</th>
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
              Précédent
            </Button>
            <span className="text-sm text-muted-foreground">
              Page {meta?.current_page ?? page} / {meta?.last_page ?? 1}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!meta || page >= meta.last_page}
              onClick={() => setPage((value) => value + 1)}
            >
              Suivant
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
  const elapsedDays = elapsedDaysSince(row.submitted_at, now);

  return (
    <tr className="transition-colors hover:bg-stone-50">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Building2 className="size-4 text-stone-400" aria-hidden="true" />
          <div>
            <p className="font-medium text-foreground">
              {row.agency?.name ?? row.company_legal_name ?? `Agence #${row.agency_id}`}
            </p>
            <p className="text-xs text-muted-foreground">
              #{row.agency_id}
              {row.planned_agents_count
                ? ` · ${row.planned_agents_count} agent(s) prévu(s)`
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
                `User #${row.submitted_by}`}
            </p>
            {row.submitter.email ? (
              <p className="text-xs text-muted-foreground">{row.submitter.email}</p>
            ) : null}
          </>
        ) : (
          <span className="text-xs">User #{row.submitted_by}</span>
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
            ? "Aujourd'hui"
            : elapsedDays === 1
              ? '1 jour'
              : `${elapsedDays} jours`}
      </td>
      <td className="px-3 py-2 text-right">
        <Link
          className={buttonVariants({ variant: 'outline', size: 'sm' })}
          href={`/super-admin/agency-upgrade-requests/${row.id}`}
        >
          Examiner
          <ArrowUpRight className="ml-1 size-3.5" aria-hidden="true" />
        </Link>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { readonly status: AgencyUpgradeRequestStatus }) {
  const map: Record<AgencyUpgradeRequestStatus, { label: string; className: string }> = {
    pending: {
      label: 'En attente',
      className: 'bg-amber-100 text-amber-900',
    },
    approved: {
      label: 'Approuvée',
      className: 'bg-emerald-100 text-emerald-900',
    },
    rejected: {
      label: 'Rejetée',
      className: 'bg-red-100 text-red-900',
    },
    revoked: {
      label: 'Révoquée',
      className: 'bg-stone-200 text-stone-800',
    },
  };
  const { label, className } = map[status];
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
