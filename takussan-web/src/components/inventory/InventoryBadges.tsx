'use client';

import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import type {
  InventoryElementState,
  InventoryStatus,
  InventoryType,
} from '@/types/inventory';
import {
  inventoryElementStateBadgeClass,
  inventoryStatusBadgeClass,
  inventoryTypeBadgeClass,
} from './labels';

const BASE_BADGE = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function InventoryStatusBadge({
  status,
  className,
}: {
  readonly status: InventoryStatus;
  readonly className?: string;
}) {
  const t = useTranslations('inventory.status');
  return (
    <span className={cn(BASE_BADGE, inventoryStatusBadgeClass(status), className)}>
      {t(status)}
    </span>
  );
}

export function InventoryTypeBadge({
  type,
  className,
}: {
  readonly type: InventoryType;
  readonly className?: string;
}) {
  const t = useTranslations('inventory.types');
  return (
    <span className={cn(BASE_BADGE, inventoryTypeBadgeClass(type), className)}>
      {t(type)}
    </span>
  );
}

export function InventoryElementStateBadge({
  state,
  className,
}: {
  readonly state: InventoryElementState;
  readonly className?: string;
}) {
  const t = useTranslations('inventory.elementStates');
  return (
    <span className={cn(BASE_BADGE, inventoryElementStateBadgeClass(state), className)}>
      {t(state)}
    </span>
  );
}
