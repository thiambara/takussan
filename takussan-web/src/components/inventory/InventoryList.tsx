'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useLocale } from 'next-intl';

import { QueryBoundary } from '@/components/shared/QueryBoundary';
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

import {
  INVENTORY_STATUS_LABEL,
  INVENTORY_TYPE_LABEL,
} from './labels';
import { InventoryStatusBadge, InventoryTypeBadge } from './InventoryBadges';

export function InventoryList() {
  const locale = useLocale() as Locale;
  const [type, setType] = useState<'' | InventoryType>('');
  const [status, setStatus] = useState<'' | InventoryStatus>('');

  const params = useMemo<InventoryListParams>(() => ({
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  }), [type, status]);

  const query = useInventories(params);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex w-56 flex-col">
          <label htmlFor="inventory-filter-type" className="mb-1.5 text-sm font-medium">
            Type
          </label>
          <select
            id="inventory-filter-type"
            value={type}
            onChange={(e) => setType(e.target.value as '' | InventoryType)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tous les types</option>
            {INVENTORY_TYPES.map((t) => (
              <option key={t} value={t}>{INVENTORY_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div className="flex w-56 flex-col">
          <label htmlFor="inventory-filter-status" className="mb-1.5 text-sm font-medium">
            Statut
          </label>
          <select
            id="inventory-filter-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as '' | InventoryStatus)}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">Tous les statuts</option>
            {INVENTORY_STATUSES.map((s) => (
              <option key={s} value={s}>{INVENTORY_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </div>

      <QueryBoundary query={query}>
        {(data) => {
          if (data.data.length === 0) {
            return (
              <div className="rounded-2xl bg-app-surface-1 p-10 text-center">
                <p className="text-sm font-semibold text-app-ink">
                  Aucun état des lieux
                </p>
                <p className="mt-1 text-xs text-app-ink-muted">
                  Créez un état des lieux depuis un bail actif.
                </p>
              </div>
            );
          }
          return (
            <ul className="space-y-2">
              {data.data.map((inv) => (
                <li key={inv.id} className="rounded-xl bg-app-surface-1 shadow-sm transition-colors hover:bg-app-surface-2">
                  <Link
                    href={`/app/inventories/${inv.id}`}
                    className="flex flex-col gap-2 p-4 md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-app-ink">
                        État des lieux #{inv.id} · Bail #{inv.lease_id}
                      </p>
                      <p className="mt-1 text-xs text-app-ink-muted">
                        {inv.conducted_at
                          ? `Réalisé le ${formatDate(inv.conducted_at, locale)}`
                          : `Créé le ${formatDate(inv.created_at, locale)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <InventoryTypeBadge type={inv.type} />
                      <InventoryStatusBadge status={inv.status} />
                    </div>
                  </Link>
                </li>
              ))}
              {data.meta.last_page > 1 ? (
                <li className="pt-3 text-center text-xs text-app-ink-muted">
                  Page {data.meta.current_page} / {data.meta.last_page} — {data.meta.total} entrées
                </li>
              ) : null}
            </ul>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
