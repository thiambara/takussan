'use client';

import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal } from 'lucide-react';
import {
  DataTable,
  StatusBadge,
  type DataTableColumn,
} from '@/components/console';
import { ErrorState } from '@/components/feedback';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ConfirmActionDialog } from '@/components/admin/super/ConfirmActionDialog';
import {
  archiveProperties,
  deleteProperty,
  postPropertyAction,
} from '@/lib/queries/super-admin';
import type { AdminPropertyRow } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { RENT_PERIOD_SHORT } from '@/components/property/cards/types';
// TCK-472 (intégration) — cette table était recopiée ici, et il lui manquait SIX clés :
// `published`, `pending`, `pending_review` et `rejected` retombaient sur `neutral`. Un bien
// rejeté s'affichait donc en gris dans la table super-admin, quand le reste du produit le
// peint en rouge. Une copie ne diverge pas seulement en contredisant — elle diverge en
// OMETTANT, ce qui est plus discret encore. La table canonique est la seule source.
import { PROPERTY_STATUS_TONE } from '@/components/property-dashboard/PropertyStatusBadge';
import { DATE_COURTE, useFormatteurs } from '@/lib/format/useFormatteurs';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';


type ConfirmIntent =
  | { action: 'unpublish'; ids: number[] }
  | { action: 'archive'; ids: number[] }
  | { action: 'delete'; ids: number[] };

interface SuperAdminPropertiesTableProps {
  rows: AdminPropertyRow[];
  total: number;
  onChange: () => void;
}

export function SuperAdminPropertiesTable({ rows, total, onChange }: SuperAdminPropertiesTableProps) {
  const t = useTranslations('superAdmin.properties.table');
  const tCommon = useTranslations('common');
  const fmt = useFormatteurs();
  const messageErreur = useMessageErreurApi();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [intent, setIntent] = useState<ConfirmIntent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sort = searchParams.get('sort') ?? '-created_at';

  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));
  const someSelected = !allSelected && rows.some((row) => selected.has(row.id));

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (rows.every((row) => prev.has(row.id))) {
        const next = new Set(prev);
        for (const row of rows) next.delete(row.id);
        return next;
      }
      const next = new Set(prev);
      for (const row of rows) next.add(row.id);
      return next;
    });
  }, [rows]);

  const toggleOne = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // `DataTable` compose lui-même la chaîne de tri suivante (`price` ↔ `-price`) : ce rappel ne
  // fait plus que l'écrire dans l'URL. C'est le sens du contrat de tri de la primitive — la
  // console avait trois écrans triables et trois façons différentes de basculer la direction.
  const onSortChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('sort', next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams],
  );

  const refresh = useCallback(() => {
    setSelected(new Set());
    setIntent(null);
    setError(null);
    queryClient.invalidateQueries({ queryKey: ['super-admin', 'properties'] });
    onChange();
  }, [onChange, queryClient]);

  const publishMutation = useMutation({
    mutationFn: (id: number) => postPropertyAction(id, 'publish'),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(messageErreur(err)),
  });
  const unpublishMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => postPropertyAction(id, 'unpublish'))),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(messageErreur(err)),
  });
  const archiveMutation = useMutation({
    mutationFn: (ids: number[]) => archiveProperties(ids),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(messageErreur(err)),
  });
  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => deleteProperty(id))),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(messageErreur(err)),
  });

  const pending =
    publishMutation.isPending ||
    unpublishMutation.isPending ||
    archiveMutation.isPending ||
    deleteMutation.isPending;

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const onConfirm = useCallback(() => {
    if (!intent) return;
    if (intent.action === 'unpublish') unpublishMutation.mutate(intent.ids);
    else if (intent.action === 'archive') archiveMutation.mutate(intent.ids);
    else if (intent.action === 'delete') deleteMutation.mutate(intent.ids);
  }, [archiveMutation, deleteMutation, intent, unpublishMutation]);

  const columns: DataTableColumn<AdminPropertyRow>[] = [
    {
      id: 'select',
      header: (
        <>
          <label className="sr-only" htmlFor="select-all">{t('selectAll')}</label>
          <input
            id="select-all"
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected;
            }}
            onChange={toggleAll}
            aria-label={t('selectAll')}
          />
        </>
      ),
      cell: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.id)}
          onChange={() => toggleOne(row.id)}
          aria-label={t('selectRowAria', { title: row.title })}
        />
      ),
    },
    {
      id: 'property',
      header: t('colProperty'),
      cell: (row) => (
        <>
          <Link
            href={`/properties/${row.slug}`}
            className="block max-w-xs truncate font-semibold text-foreground hover:text-primary"
          >
            {row.title}
          </Link>
          <p className="text-xs text-muted-foreground">{row.reference_number}</p>
        </>
      ),
    },
    { id: 'agency', header: t('colAgency'), cell: (row) => row.agency?.name ?? '—' },
    { id: 'city', header: t('colCity'), cell: (row) => row.location.city ?? '—' },
    { id: 'type', header: t('colType'), cell: (row) => row.type ?? '—' },
    {
      id: 'price',
      header: t('colPrice'),
      sortKey: 'price',
      sortLabel: t('sortByAria', { label: t('colPrice') }),
      className: 'tabular-nums',
      cell: (row) => (
        <>
          {fmt.montant(row.price, row.currency)}
          {row.contract_type === 'rent' && row.rent_period ? (
            <span className="ml-0.5 text-xs font-medium text-muted-foreground">
              /{RENT_PERIOD_SHORT[row.rent_period]}
            </span>
          ) : null}
        </>
      ),
    },
    {
      id: 'status',
      header: t('colStatus'),
      cell: (row) =>
        row.status ? (
          <StatusBadge tone={PROPERTY_STATUS_TONE[row.status] ?? 'neutral'} label={row.status_label ?? row.status} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'published_at',
      header: t('colPublication'),
      sortKey: 'published_at',
      sortLabel: t('sortByAria', { label: t('colPublication') }),
      className: 'text-muted-foreground',
      cell: (row) => fmt.date(row.published_at, DATE_COURTE),
    },
    {
      id: 'created_at',
      header: t('colUpdated'),
      sortKey: 'created_at',
      sortLabel: t('sortByAria', { label: t('colUpdated') }),
      className: 'text-muted-foreground',
      cell: (row) => fmt.date(row.created_at, DATE_COURTE),
    },
    {
      id: 'actions',
      header: t('colActions'),
      headerSrOnly: true,
      align: 'end',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={t('rowActionsAria', { title: row.title })}
                data-testid={`row-actions-${row.id}`}
              />
            }
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem render={<Link href={`/properties/${row.slug}`} />}>
              {t('viewPublic')}
            </DropdownMenuItem>
            <DropdownMenuItem render={<Link href={`/app/properties/${row.id}`} />}>
              {t('openBackOffice')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {row.visibility !== 'public' ? (
              <DropdownMenuItem onClick={() => publishMutation.mutate(row.id)} disabled={pending}>
                {t('publish')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => setIntent({ action: 'unpublish', ids: [row.id] })}
                disabled={pending}
              >
                {t('unpublish')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => setIntent({ action: 'archive', ids: [row.id] })}
              disabled={pending}
            >
              {t('archive')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setIntent({ action: 'delete', ids: [row.id] })}
              disabled={pending}
              className="text-destructive"
            >
              {tCommon('actions.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 ? (
        <div
          data-testid="bulk-actions"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-primary/10 px-4 py-2 text-sm text-foreground ring-1 ring-primary/20"
        >
          <span>
            {t('selectedCount', { count: selectedIds.length })}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIntent({ action: 'unpublish', ids: selectedIds })}
              disabled={pending}
            >
              {t('unpublish')}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setIntent({ action: 'archive', ids: selectedIds })}
              disabled={pending}
            >
              {t('archive')}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorState message={error} /> : null}

      <DataTable
        data-testid="super-admin-properties-table"
        caption={t('tableCaption')}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        rowProps={(row) => ({ 'data-testid': `super-admin-property-${row.id}` })}
        sort={{ value: sort, onChange: onSortChange }}
      />

      <p className="text-xs text-muted-foreground">
        {t('totalCount', { count: total })}
      </p>

      {intent ? (
        <ConfirmActionDialog
          open={intent !== null}
          onOpenChange={(o) => {
            if (!o) setIntent(null);
          }}
          title={confirmTitle(intent, t)}
          description={confirmDescription(intent, t)}
          confirmPhrase={confirmPhrase(intent)}
          confirmLabel={confirmLabel(intent, t)}
          destructive
          pending={pending}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}

type Traducteur = (key: string, values?: Record<string, string | number>) => string;

function confirmTitle(intent: ConfirmIntent, t: Traducteur): string {
  const count = intent.ids.length;
  if (intent.action === 'archive') return t('confirm.archiveTitle', { count });
  if (intent.action === 'delete') return t('confirm.deleteTitle', { count });
  return t('confirm.unpublishTitle', { count });
}

function confirmDescription(intent: ConfirmIntent, t: Traducteur): string {
  if (intent.action === 'archive') return t('confirm.archiveDescription');
  if (intent.action === 'delete') return t('confirm.deleteDescription');
  return t('confirm.unpublishDescription');
}

/** Jetons de confirmation : comparés à la frappe de l'opérateur, donc jamais traduits. */
function confirmPhrase(intent: ConfirmIntent): string {
  if (intent.action === 'archive') return 'ARCHIVER';
  if (intent.action === 'delete') return 'SUPPRIMER';
  return 'DEPUBLIER';
}

function confirmLabel(intent: ConfirmIntent, t: Traducteur): string {
  if (intent.action === 'archive') return t('confirm.archiveLabel');
  if (intent.action === 'delete') return t('confirm.deleteLabel');
  return t('confirm.unpublishLabel');
}
