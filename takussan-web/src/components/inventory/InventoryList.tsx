'use client';

import Link from 'next/link';
import { useMemo, useState, useCallback } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, ClipboardList, Plus } from 'lucide-react';

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
import { formatDate } from '@/lib/format';
import type { Locale } from '@/i18n/config';
import {
  useInventories,
  type InventoryListParams,
} from '@/lib/queries/inventory';
import {
  INVENTORY_STATUSES,
  INVENTORY_TYPES,
  type InventoryStatus,
  type InventoryType,
} from '@/types/inventory';

import { InventoryStatusBadge, InventoryTypeBadge } from './InventoryBadges';

/**
 * TCK-379 — `canCreate` porte le geste de création, et il est passé par la PAGE (server
 * component, qui seule connaît les rôles) plutôt que lu ici : ce composant est monté côté
 * client, où `roles` n'est pas une source d'autorisation.
 *
 * ⚠ Le bouton vit dans la barre d'outils, PAS dans l'état vide. C'est tout l'objet du défaut
 * corrigé : la liste peuplée n'offrait aucun geste, et l'état vide renvoyait vers `/app/leases`
 * — c'est-à-dire envoyait l'agent chercher lui-même dans une autre section.
 */
interface InventoryListProps {
  readonly canCreate?: boolean;
}

export function InventoryList({ canCreate = false }: InventoryListProps) {
  const locale = useLocale() as Locale;
  const t = useTranslations('inventory.list');
  const tRoot = useTranslations('inventory');
  const tTypes = useTranslations('inventory.types');
  const tStatus = useTranslations('inventory.status');
  const [type, setType] = useState<'' | InventoryType>('');
  const [status, setStatus] = useState<'' | InventoryStatus>('');
  const [page, setPage] = useState(1);

  const params = useMemo<InventoryListParams>(() => ({
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
    page,
  }), [type, status, page]);

  const query = useInventories(params);

  const prevPage = useCallback(() => setPage((p) => Math.max(1, p - 1)), []);
  const nextPage = useCallback(() => setPage((p) => p + 1), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-0 flex-1 basis-36 flex-col sm:w-56 sm:flex-none">
          <label htmlFor="inventory-filter-type" className="mb-1.5 text-sm font-medium">
            {t('type')}
          </label>
          <Select
            value={type || '__all__'}
            onValueChange={(value) => setType(value === '__all__' ? '' : ((value ?? '') as '' | InventoryType))}
            items={[{ value: '__all__', label: t('allTypes') }, ...INVENTORY_TYPES.map((value) => ({ value, label: tTypes(value) }))]}
          >
            <SelectTrigger id="inventory-filter-type" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('allTypes')}</SelectItem>
              {INVENTORY_TYPES.map((value) => (
                <SelectItem key={value} value={value}>{tTypes(value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-1 basis-36 flex-col sm:w-56 sm:flex-none">
          <label htmlFor="inventory-filter-status" className="mb-1.5 text-sm font-medium">
            {t('statusLabel')}
          </label>
          <Select
            value={status || '__all__'}
            onValueChange={(value) => setStatus(value === '__all__' ? '' : ((value ?? '') as '' | InventoryStatus))}
            items={[{ value: '__all__', label: t('allStatuses') }, ...INVENTORY_STATUSES.map((value) => ({ value, label: tStatus(value) }))]}
          >
            <SelectTrigger id="inventory-filter-status" className="h-9 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('allStatuses')}</SelectItem>
              {INVENTORY_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>{tStatus(value)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canCreate ? (
          <Link
            href="/app/inventories/new"
            className={buttonVariants({ className: 'h-9 w-full sm:ml-auto sm:w-auto' })}
          >
            <Plus className="size-4" aria-hidden="true" />
            {t('create')}
          </Link>
        ) : null}
      </div>

      <QueryBoundary query={query}>
        {(data) => {
          if (data.data.length === 0) {
            return (
              <EmptyState
                icon={<ClipboardList className="size-8" aria-hidden="true" />}
                title={t('empty_title')}
                description={t('empty_description')}
                action={
                  canCreate ? (
                    <Link href="/app/inventories/new" className={buttonVariants()}>
                      {t('create')}
                    </Link>
                  ) : (
                    <Link href="/app/leases" className={buttonVariants()}>
                      {t('empty_cta')}
                    </Link>
                  )
                }
              />
            );
          }
          return (
            <ul className="space-y-2">
              {data.data.map((inv) => (
                <li key={inv.id}>
                  <Link
                    href={`/app/inventories/${inv.id}`}
                    className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4 transition-[box-shadow,border-color] hover:border-foreground/15 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {inv.property?.title ?? tRoot('fallbackReference', { id: String(inv.id) })}
                        {inv.lease?.reference_number ? (
                          <span className="font-normal text-muted-foreground">
                            {' · '}
                            {inv.lease.reference_number}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {inv.conducted_at
                          ? t('conductedOn', { date: formatDate(inv.conducted_at, locale) })
                          : t('createdOn', { date: formatDate(inv.created_at, locale) })}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <InventoryTypeBadge type={inv.type} />
                      <InventoryStatusBadge status={inv.status} />
                    </div>
                  </Link>
                </li>
              ))}
              {data.meta.last_page > 1 ? (
                <li className="flex items-center justify-between gap-3 pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.meta.current_page <= 1}
                    onClick={prevPage}
                  >
                    <ChevronLeft aria-hidden="true" />
                    {t('previous')}
                  </Button>
                  <span className="text-center text-xs text-muted-foreground tabular-nums">
                    {t('pagination', {
                      current: String(data.meta.current_page),
                      last: String(data.meta.last_page),
                      total: String(data.meta.total),
                    })}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={data.meta.current_page >= data.meta.last_page}
                    onClick={nextPage}
                  >
                    {t('next')}
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </li>
              ) : null}
            </ul>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
