'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ArrowUpDown, MoreHorizontal } from 'lucide-react';
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

type SortableKey = 'created_at' | 'price' | 'published_at';

type ConfirmIntent =
  | { action: 'unpublish'; ids: number[] }
  | { action: 'archive'; ids: number[] }
  | { action: 'delete'; ids: number[] };

interface SuperAdminPropertiesTableProps {
  rows: AdminPropertyRow[];
  total: number;
  onChange: () => void;
}

function formatPrice(price: number, currency: string | null): string {
  const code = currency ?? 'XOF';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(price);
  } catch {
    return `${price.toLocaleString('fr-FR')} ${code}`;
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function SuperAdminPropertiesTable({ rows, total, onChange }: SuperAdminPropertiesTableProps) {
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

  const onSortClick = useCallback(
    (key: string) => {
      const params = new URLSearchParams(searchParams.toString());
      const next = sort === `-${key}` ? key : `-${key}`;
      params.set('sort', next);
      router.replace(`?${params.toString()}`);
    },
    [router, searchParams, sort],
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
    onError: (err: ApiError) => setError(err.displayMessage),
  });
  const unpublishMutation = useMutation({
    mutationFn: (ids: number[]) =>
      Promise.all(ids.map((id) => postPropertyAction(id, 'unpublish'))),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(err.displayMessage),
  });
  const archiveMutation = useMutation({
    mutationFn: (ids: number[]) => archiveProperties(ids),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(err.displayMessage),
  });
  const deleteMutation = useMutation({
    mutationFn: (ids: number[]) => Promise.all(ids.map((id) => deleteProperty(id))),
    onSuccess: refresh,
    onError: (err: ApiError) => setError(err.displayMessage),
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

  return (
    <div className="space-y-3">
      {selectedIds.length > 0 ? (
        <div
          data-testid="bulk-actions"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-amber-50 px-4 py-2 text-sm text-stone-800 ring-1 ring-amber-200"
        >
          <span>
            {selectedIds.length} bien{selectedIds.length > 1 ? 's' : ''} sélectionné
            {selectedIds.length > 1 ? 's' : ''}.
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIntent({ action: 'unpublish', ids: selectedIds })}
              disabled={pending}
            >
              Dépublier
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setIntent({ action: 'archive', ids: selectedIds })}
              disabled={pending}
            >
              Archiver
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-900 ring-1 ring-red-200" role="alert">
          {error}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-stone-200">
        <table className="min-w-full divide-y divide-stone-200 text-sm" data-testid="super-admin-properties-table">
          <thead className="bg-stone-50 text-left text-xs font-semibold uppercase text-stone-500">
            <tr>
              <th scope="col" className="px-3 py-2">
                <label className="sr-only" htmlFor="select-all">Tout sélectionner</label>
                <input
                  id="select-all"
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={toggleAll}
                  aria-label="Tout sélectionner"
                />
              </th>
              <th scope="col" className="px-3 py-2">Bien</th>
              <th scope="col" className="px-3 py-2">Agence</th>
              <th scope="col" className="px-3 py-2">Ville</th>
              <th scope="col" className="px-3 py-2">Type</th>
              <SortHeader sortKey="price" label="Prix" currentSort={sort} onClick={onSortClick} />
              <th scope="col" className="px-3 py-2">Statut</th>
              <SortHeader
                sortKey="published_at"
                label="Publication"
                currentSort={sort}
                onClick={onSortClick}
              />
              <SortHeader
                sortKey="created_at"
                label="Mis à jour"
                currentSort={sort}
                onClick={onSortClick}
              />
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {rows.map((row) => (
              <tr
                key={row.id}
                data-testid={`super-admin-property-${row.id}`}
                className="hover:bg-stone-50"
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggleOne(row.id)}
                    aria-label={`Sélectionner ${row.title}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link
                    href={`/properties/${row.slug}`}
                    className="block max-w-xs truncate font-semibold text-stone-900 hover:text-amber-700"
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-stone-500">{row.reference_number}</p>
                </td>
                <td className="px-3 py-2 text-stone-700">{row.agency?.name ?? '—'}</td>
                <td className="px-3 py-2 text-stone-700">{row.location.city ?? '—'}</td>
                <td className="px-3 py-2 text-stone-700">{row.type ?? '—'}</td>
                <td className="px-3 py-2 text-stone-900 tabular-nums">
                  {formatPrice(row.price, row.currency)}
                  {row.contract_type === 'rent' && row.rent_period ? (
                    <span className="ml-0.5 text-xs font-medium text-stone-500">
                      /{RENT_PERIOD_SHORT[row.rent_period]}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} label={row.status_label} />
                </td>
                <td className="px-3 py-2 text-stone-600">{formatDate(row.published_at)}</td>
                <td className="px-3 py-2 text-stone-600">{formatDate(row.created_at)}</td>
                <td className="px-3 py-2 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Actions pour ${row.title}`}
                          data-testid={`row-actions-${row.id}`}
                        />
                      }
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem render={<Link href={`/properties/${row.slug}`} />}>
                        Voir détail public
                      </DropdownMenuItem>
                      <DropdownMenuItem render={<Link href={`/app/properties/${row.id}`} />}>
                        Ouvrir dans le back-office
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {row.visibility !== 'public' ? (
                        <DropdownMenuItem
                          onClick={() => publishMutation.mutate(row.id)}
                          disabled={pending}
                        >
                          Publier
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem
                          onClick={() => setIntent({ action: 'unpublish', ids: [row.id] })}
                          disabled={pending}
                        >
                          Dépublier
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => setIntent({ action: 'archive', ids: [row.id] })}
                        disabled={pending}
                      >
                        Archiver
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setIntent({ action: 'delete', ids: [row.id] })}
                        disabled={pending}
                        className="text-red-700"
                      >
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-stone-500">
        {total} bien{total > 1 ? 's' : ''} au total · agences confondues.
      </p>

      {intent ? (
        <ConfirmActionDialog
          open={intent !== null}
          onOpenChange={(o) => {
            if (!o) setIntent(null);
          }}
          title={confirmTitle(intent)}
          description={confirmDescription(intent)}
          confirmPhrase={confirmPhrase(intent)}
          confirmLabel={confirmLabel(intent)}
          destructive
          pending={pending}
          onConfirm={onConfirm}
        />
      ) : null}
    </div>
  );
}

function SortHeader({
  sortKey,
  label,
  currentSort,
  onClick,
}: {
  sortKey: SortableKey;
  label: string;
  currentSort: string;
  onClick: (key: string) => void;
}) {
  const desc = currentSort === `-${sortKey}`;
  const asc = currentSort === sortKey;
  const Icon = desc ? ArrowDown : asc ? ArrowUp : ArrowUpDown;
  return (
    <th scope="col" className="px-3 py-2">
      <button
        type="button"
        onClick={() => onClick(sortKey)}
        className="inline-flex items-center gap-1 hover:text-stone-900"
        aria-label={`Trier par ${label}`}
      >
        {label}
        <Icon className="size-3" aria-hidden="true" />
      </button>
    </th>
  );
}

function StatusBadge({ status, label }: { status: string | null; label: string | null }) {
  if (!status) return <span className="text-stone-400">—</span>;
  const tone =
    status === 'available'
      ? 'bg-green-50 text-green-800 ring-green-200'
      : status === 'sold' || status === 'rented'
      ? 'bg-blue-50 text-blue-800 ring-blue-200'
      : status === 'unavailable' || status === 'under_maintenance'
      ? 'bg-amber-50 text-amber-800 ring-amber-200'
      : 'bg-stone-100 text-stone-700 ring-stone-200';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ring-1 ${tone}`}>
      {label ?? status}
    </span>
  );
}

function confirmTitle(intent: ConfirmIntent): string {
  const count = intent.ids.length;
  if (intent.action === 'archive') return `Archiver ${count} bien${count > 1 ? 's' : ''}`;
  if (intent.action === 'delete') return `Supprimer ${count} bien${count > 1 ? 's' : ''}`;
  return `Dépublier ${count} bien${count > 1 ? 's' : ''}`;
}

function confirmDescription(intent: ConfirmIntent): string {
  if (intent.action === 'archive') {
    return 'Les biens archivés sortent du portefeuille actif. Cette action est auditée.';
  }
  if (intent.action === 'delete') {
    return 'La suppression est un soft-delete. Les biens disparaissent des listes mais peuvent être restaurés depuis l\'admin.';
  }
  return 'Les biens dépubliés repassent en brouillon et ne sont plus visibles publiquement.';
}

function confirmPhrase(intent: ConfirmIntent): string {
  if (intent.action === 'archive') return 'ARCHIVER';
  if (intent.action === 'delete') return 'SUPPRIMER';
  return 'DEPUBLIER';
}

function confirmLabel(intent: ConfirmIntent): string {
  if (intent.action === 'archive') return 'Confirmer l\'archivage';
  if (intent.action === 'delete') return 'Confirmer la suppression';
  return 'Confirmer la dépublication';
}
