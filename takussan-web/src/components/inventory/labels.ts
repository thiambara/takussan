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
  draft: 'bg-muted text-muted-foreground',
  pending_signature: 'bg-warning/15 text-warning',
  signed: 'bg-success/15 text-success',
  disputed: 'bg-destructive/10 text-destructive',
};

export function inventoryStatusBadgeClass(status: InventoryStatus): string {
  return STATUS_TONE[status] ?? 'bg-muted text-muted-foreground';
}

/**
 * ⚠ TCK-381 — `move_in` et `move_out` sont deux TYPES opposés, jamais deux statuts : leur donner
 * le même ton aurait effacé l'opposition que la pastille existe pour porter. `--info` et
 * `--primary`, comme au calendrier.
 */
const TYPE_TONE: Record<InventoryType, string> = {
  move_in: 'bg-info/15 text-info',
  move_out: 'bg-primary/12 text-primary',
};

export function inventoryTypeBadgeClass(type: InventoryType): string {
  return TYPE_TONE[type] ?? 'bg-muted text-muted-foreground';
}

const ELEMENT_STATE_TONE: Record<InventoryElementState, string> = {
  bon: 'bg-success/15 text-success',
  'usé': 'bg-warning/15 text-warning',
  // `endommagé` était en orange et `usé` en ambre : deux crans d'un même avertissement. Le DS
  // n'a qu'un jeton d'avertissement — on garde le cran par l'INTENSITÉ, pas par la teinte.
  'endommagé': 'bg-warning/30 text-warning',
  manquant: 'bg-destructive/10 text-destructive',
};

export function inventoryElementStateBadgeClass(state: InventoryElementState): string {
  return ELEMENT_STATE_TONE[state] ?? 'bg-muted text-muted-foreground';
}
