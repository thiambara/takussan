import type { CustomerPipelineStage } from '@/types/customer';

/**
 * TCK-083 — Centralised TanStack Query keys for CRM pipeline state.
 * Every cache-mutation in the kanban (drag-drop, sheet edits, stats refresh)
 * goes through these helpers.
 *
 * TCK-2592 — une colonne, une liste et les statistiques se lisent pour une portée et des filtres
 * (`cleDesFiltres`, `lib/crm/pipeline`) : la clé les porte, en DERNIER, pour que la mise à jour
 * optimiste retrouve toutes les copies d'une colonne par son préfixe (`columnsOf`) et que le retour
 * arrière les restaure toutes. Sans filtre (`''`), la clé d'avant plus un segment vide.
 */
export const PIPELINE_QUERY_KEY = {
  root: () => ['crm-pipeline'] as const,
  /** Le préfixe de toutes les statistiques, quelles que soient leur portée et leurs filtres. */
  statsAll: () => ['crm-pipeline', 'stats'] as const,
  stats: (filtres = '') => ['crm-pipeline', 'stats', filtres] as const,
  /** Le préfixe de toutes les copies d'une colonne. */
  columnsOf: (stage: CustomerPipelineStage) => ['crm-pipeline', 'column', stage] as const,
  column: (stage: CustomerPipelineStage, filtres = '') =>
    ['crm-pipeline', 'column', stage, filtres] as const,
  /** Le préfixe de toutes les listes (relances du téléphone, vue Liste du bureau). */
  listsAll: () => ['crm-pipeline', 'liste'] as const,
  list: (filtres: string, segment: string) => ['crm-pipeline', 'liste', filtres, segment] as const,
  customerTasks: (customerId: number) =>
    ['crm-pipeline', 'customer', customerId, 'tasks'] as const,
  customerNotes: (customerId: number) =>
    ['crm-pipeline', 'customer', customerId, 'notes'] as const,
};
