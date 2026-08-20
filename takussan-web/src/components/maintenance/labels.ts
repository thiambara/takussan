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

const STATUS_TONE: Record<MaintenanceStatus, string> = {
  open: 'bg-blue-100 text-blue-800',
  acknowledged: 'bg-indigo-100 text-indigo-800',
  quote_requested: 'bg-fuchsia-100 text-fuchsia-800',
  quote_submitted: 'bg-purple-100 text-purple-800',
  approved: 'bg-lime-100 text-lime-800',
  rejected: 'bg-rose-100 text-rose-800',
  assigned: 'bg-violet-100 text-violet-800',
  in_progress: 'bg-amber-100 text-amber-800',
  completed: 'bg-emerald-100 text-emerald-800',
  closed: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-red-100 text-red-800',
};

export function maintenanceStatusBadgeClass(status: MaintenanceStatus): string {
  return STATUS_TONE[status] ?? 'bg-gray-100 text-gray-700';
}

const PRIORITY_TONE: Record<MaintenancePriority, string> = {
  low: 'bg-slate-100 text-slate-700',
  normal: 'bg-sky-100 text-sky-800',
  high: 'bg-orange-100 text-orange-800',
  urgent: 'bg-red-100 text-red-800',
};

export function maintenancePriorityBadgeClass(priority: MaintenancePriority): string {
  return PRIORITY_TONE[priority] ?? 'bg-gray-100 text-gray-700';
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
