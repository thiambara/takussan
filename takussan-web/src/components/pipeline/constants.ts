import type { CustomerPipelineStage } from '@/types/customer';

/**
 * TCK-083 — order + ambient color of each kanban column. Colors are
 * intentionally muted to avoid drag-feedback fighting with stage borders.
 */
export const PIPELINE_STAGES: readonly CustomerPipelineStage[] = [
  'lead',
  'prospect',
  'qualified',
  'negotiating',
  'converted',
  'lost',
];

export const STAGE_COLOR: Record<CustomerPipelineStage, string> = {
  lead: 'border-app-surface-2 bg-app-surface-1/40',
  prospect: 'border-blue-200 bg-blue-50/40 dark:bg-blue-950/20',
  qualified: 'border-cyan-200 bg-cyan-50/40 dark:bg-cyan-950/20',
  negotiating: 'border-amber-200 bg-amber-50/40 dark:bg-amber-950/20',
  converted: 'border-emerald-200 bg-emerald-50/40 dark:bg-emerald-950/20',
  lost: 'border-zinc-200 bg-zinc-50/40 dark:bg-zinc-900/20',
};

export const STAGE_DOT: Record<CustomerPipelineStage, string> = {
  lead: 'bg-app-ink-muted/40',
  prospect: 'bg-blue-400',
  qualified: 'bg-cyan-400',
  negotiating: 'bg-amber-400',
  converted: 'bg-emerald-400',
  lost: 'bg-zinc-400',
};

export const TERMINAL_STAGES: readonly CustomerPipelineStage[] = [
  'converted',
  'lost',
];
