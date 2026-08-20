/**
 * Classes de teinte du domaine « état des lieux ».
 *
 * ⚠ Les tables de LIBELLÉS français (`INVENTORY_*_LABEL`) qui vivaient ici ont été retirées par
 * TCK-292 : le texte affiché appartient au front, mais il appartient au DICTIONNAIRE, pas à un
 * module de constantes. Les libellés se résolvent désormais sous `inventory.types.*`,
 * `inventory.status.*`, `inventory.conditions.*` et `inventory.elementStates.*` — la clé étant
 * la valeur d'enum elle-même, un composant écrit `t(`status.${status}`)`.
 *
 * Ce qui reste ici est ce qui n'est PAS du texte : la teinte associée à chaque valeur d'enum.
 */

import type {
  InventoryElementState,
  InventoryStatus,
  InventoryType,
} from '@/types/inventory';

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
