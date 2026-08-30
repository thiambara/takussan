'use client';

import { useTranslations } from 'next-intl';

import { StatusBadge } from '@/components/console/StatusBadge';
import { cn } from '@/lib/utils';
import type {
  InventoryElementState,
  InventoryStatus,
  InventoryType,
} from '@/types/inventory';
import {
  inventoryElementStateBadgeClass,
  inventoryStatusTone,
  inventoryTypeBadgeClass,
} from './labels';

/**
 * ⚠ `border border-transparent` n'est pas décoratif — TCK-484. `endommagé` porte désormais une
 * bordure PLEINE (le cran d'avertissement, passé sur un canal sans texte), et sans bordure
 * transparente sur les autres pastilles, ce seul badge serait 2 px plus haut que ses voisins de
 * la même ligne. C'est aussi ce que `Badge` fait, pour la même raison.
 */
const BASE_BADGE =
  'inline-flex items-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium';

/**
 * Le statut d'un état des lieux — ABSORBÉ par `StatusBadge` (TCK-484).
 *
 * Il portait sa propre table de classes ; il ne porte plus qu'une table de TONS
 * (`INVENTORY_STATUS_TONE`) et délègue la couleur. C'est la forme de `kyc/kyc-components.tsx`.
 */
export function InventoryStatusBadge({
  status,
  className,
}: {
  readonly status: InventoryStatus;
  readonly className?: string;
}) {
  const t = useTranslations('inventory.status');
  return (
    <StatusBadge
      label={t(status)}
      tone={inventoryStatusTone(status)}
      className={cn('rounded-full', className)}
    />
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
