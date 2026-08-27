/**
 * Tons (classes Tailwind) des enums de maintenance, et la table de décision d'un devis.
 *
 * ⚠ **Les LIBELLÉS ont quitté ce module (TCK-292, lot I).** Ils vivent sous
 * `maintenance.status.*`, `maintenance.priority.*`, `maintenance.category.*` et
 * `maintenance.quote.decisions.*` dans `src/messages/{fr,en,wo}.json`. Ce qui reste ici ne
 * dépend d'aucune langue : des couleurs, et une fonction qui rend une CLÉ — patron « la donnée
 * transporte la clé, le rendu la résout » posé par TCK-286.
 *
 * `src/lib/__tests__/agent-fr-regressions.test.ts` gardait « aucune valeur d'enum technique ne
 * s'affiche » en lisant `MAINTENANCE_PRIORITY_LABEL`. La garde n'a pas disparu : elle s'exerce
 * désormais sur `maintenance.priority` du dictionnaire, devenu la source du libellé — mêmes
 * chaînes attendues, au caractère près.
 */

import type {
  MaintenanceRequest,
  MaintenancePriority,
  MaintenanceStatus,
} from '@/types/maintenance';

/**
 * ⚠ TCK-381 — onze statuts, **cinq jetons**, et la réduction est délibérée.
 *
 * La table portait onze teintes Tailwind — `fuchsia`, `purple` et `violet` y voisinaient pour
 * trois statuts consécutifs, que personne ne peut distinguer ni nommer. Le DS ne publie pas onze
 * couleurs, et `StatusBadge` le dit depuis TCK-357 : *« un appelant qui aurait besoin d'un sixième
 * ton a probablement besoin d'une colonne, pas d'une couleur de plus. »*
 *
 * Ce qui reste distinct est ce qui porte du SENS : à faire (`--info`), au devis (`--primary`), en
 * cours (`--warning`), abouti (`--success`), refusé/annulé (`--destructive`), clos (`--muted`). Le
 * libellé, lui, est toujours à côté — ce n'est pas la grille du calendrier.
 */
const STATUS_TONE: Record<MaintenanceStatus, string> = {
  open: 'bg-info/15 text-info',
  acknowledged: 'bg-info/15 text-info',
  quote_requested: 'bg-primary/12 text-primary',
  quote_submitted: 'bg-primary/12 text-primary',
  approved: 'bg-success/15 text-success',
  rejected: 'bg-destructive/15 text-destructive',
  assigned: 'bg-info/15 text-info',
  in_progress: 'bg-warning/15 text-warning',
  completed: 'bg-success/15 text-success',
  closed: 'bg-muted text-muted-foreground',
  cancelled: 'bg-destructive/15 text-destructive',
};

export function maintenanceStatusBadgeClass(status: MaintenanceStatus): string {
  return STATUS_TONE[status] ?? 'bg-muted text-muted-foreground';
}

const PRIORITY_TONE: Record<MaintenancePriority, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-info/15 text-info',
  high: 'bg-warning/15 text-warning',
  urgent: 'bg-destructive/15 text-destructive',
};

export function maintenancePriorityBadgeClass(priority: MaintenancePriority): string {
  return PRIORITY_TONE[priority] ?? 'bg-muted text-muted-foreground';
}

/** Les cinq cas de `maintenance.quote.decisions.*`. */
export type QuoteDecisionKey =
  | 'rejected'
  | 'approved'
  | 'pending'
  | 'requested'
  | 'not_applicable';

/**
 * Rend la CLÉ de décision, jamais le libellé : le composant la résout par
 * `useTranslations('maintenance.quote.decisions')`.
 */
export function quoteDecisionKey(
  request: Pick<MaintenanceRequest, 'status'>,
): QuoteDecisionKey {
  if (request.status === 'rejected') return 'rejected';
  if (['approved', 'in_progress', 'completed', 'closed'].includes(request.status)) {
    return 'approved';
  }
  if (request.status === 'quote_submitted') return 'pending';
  if (request.status === 'quote_requested') return 'requested';
  return 'not_applicable';
}
