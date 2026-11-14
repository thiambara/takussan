/**
 * TCK-2786 — le journal d'une intervention, sans rendu : la clé de libellé de chaque code émis par
 * l'API (`MaintenanceJournal` : `created`, `status.<cause>`, `owner_reminded`, `owner_unavailable`,
 * `journal.before`). Le libellé est au front (principe 5) ; un code inconnu se dit « Étape », jamais
 * par sa clé brute.
 */
export const CLES_DU_JOURNAL = [
  'created',
  'status_assigned',
  'status_unassigned',
  'status_accepted',
  'status_declined',
  'status_quote_requested',
  'status_quote_submitted',
  'status_quote_awaiting_owner',
  'status_quote_approved',
  'status_quote_rejected',
  'status_completed',
  'status_confirmed',
  'status_contested',
  'status_auto_closed',
  'status_transition',
  'owner_reminded',
  'owner_unavailable',
  'journal_before',
] as const;

export type CleDuJournal = (typeof CLES_DU_JOURNAL)[number] | 'autre';

export function cleDuJournal(code: string): CleDuJournal {
  const cle = code.replaceAll('.', '_');
  return (CLES_DU_JOURNAL as readonly string[]).includes(cle) ? (cle as CleDuJournal) : 'autre';
}
