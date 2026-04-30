import type { CustomerPipelineStage } from '@/types/customer';

/**
 * TCK-083 — Centralised TanStack Query keys for CRM pipeline state.
 * Every cache-mutation in the kanban (drag-drop, sheet edits, stats refresh)
 * goes through these helpers.
 */
export const PIPELINE_QUERY_KEY = {
  root: () => ['crm-pipeline'] as const,
  stats: () => ['crm-pipeline', 'stats'] as const,
  column: (stage: CustomerPipelineStage) =>
    ['crm-pipeline', 'column', stage] as const,
  customerTasks: (customerId: number) =>
    ['crm-pipeline', 'customer', customerId, 'tasks'] as const,
  customerNotes: (customerId: number) =>
    ['crm-pipeline', 'customer', customerId, 'notes'] as const,
};
