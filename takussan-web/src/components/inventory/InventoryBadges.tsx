import { cn } from '@/lib/utils';
import type {
  InventoryElementState,
  InventoryStatus,
  InventoryType,
} from '@/types/inventory';
import {
  INVENTORY_ELEMENT_STATE_LABEL,
  INVENTORY_STATUS_LABEL,
  INVENTORY_TYPE_LABEL,
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
  return (
    <span className={cn(BASE_BADGE, inventoryStatusBadgeClass(status), className)}>
      {INVENTORY_STATUS_LABEL[status]}
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
  return (
    <span className={cn(BASE_BADGE, inventoryTypeBadgeClass(type), className)}>
      {INVENTORY_TYPE_LABEL[type]}
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
  return (
    <span className={cn(BASE_BADGE, inventoryElementStateBadgeClass(state), className)}>
      {INVENTORY_ELEMENT_STATE_LABEL[state]}
    </span>
  );
}
