/**
 * French labels + tone classes for the inventory domain. Extracted so
 * display strings live outside component bodies (eases future i18n).
 */

import type {
  InventoryCondition,
  InventoryElementState,
  InventoryStatus,
  InventoryType,
} from '@/types/inventory';

export const INVENTORY_TYPE_LABEL: Record<InventoryType, string> = {
  move_in: 'Entrée',
  move_out: 'Sortie',
};

export const INVENTORY_STATUS_LABEL: Record<InventoryStatus, string> = {
  draft: 'Brouillon',
  pending_signature: 'En attente de signature',
  signed: 'Signé',
  disputed: 'En litige',
};

export const INVENTORY_CONDITION_LABEL: Record<InventoryCondition, string> = {
  excellent: 'Excellent',
  good: 'Bon',
  fair: 'Correct',
  poor: 'Mauvais',
};

export const INVENTORY_ELEMENT_STATE_LABEL: Record<InventoryElementState, string> = {
  bon: 'Bon',
  'usé': 'Usé',
  'endommagé': 'Endommagé',
  manquant: 'Manquant',
};

const STATUS_TONE: Record<InventoryStatus, string> = {
  draft: 'bg-slate-100 text-slate-700',
  pending_signature: 'bg-amber-100 text-amber-800',
  signed: 'bg-emerald-100 text-emerald-800',
  disputed: 'bg-red-100 text-red-800',
};

export function inventoryStatusBadgeClass(status: InventoryStatus): string {
  return STATUS_TONE[status] ?? 'bg-gray-100 text-gray-700';
}

const TYPE_TONE: Record<InventoryType, string> = {
  move_in: 'bg-sky-100 text-sky-800',
  move_out: 'bg-purple-100 text-purple-800',
};

export function inventoryTypeBadgeClass(type: InventoryType): string {
  return TYPE_TONE[type] ?? 'bg-gray-100 text-gray-700';
}

const ELEMENT_STATE_TONE: Record<InventoryElementState, string> = {
  bon: 'bg-emerald-100 text-emerald-800',
  'usé': 'bg-amber-100 text-amber-800',
  'endommagé': 'bg-orange-100 text-orange-800',
  manquant: 'bg-red-100 text-red-800',
};

export function inventoryElementStateBadgeClass(state: InventoryElementState): string {
  return ELEMENT_STATE_TONE[state] ?? 'bg-gray-100 text-gray-700';
}
