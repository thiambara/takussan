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
  lead: 'border-muted bg-card/40',
  prospect: 'border-info/30 bg-info/10 dark:bg-info/20',
  qualified: 'border-primary/30 bg-primary/10 dark:bg-primary/20',
  negotiating: 'border-warning/30 bg-warning/10 dark:bg-warning/20',
  converted: 'border-success/30 bg-success/10 dark:bg-success/20',
  lost: 'border-border bg-muted/40 dark:bg-foreground/20',
};

export const STAGE_DOT: Record<CustomerPipelineStage, string> = {
  lead: 'bg-muted-foreground/40',
  prospect: 'bg-info',
  qualified: 'bg-primary',
  negotiating: 'bg-warning',
  converted: 'bg-success',
  lost: 'bg-muted-foreground',
};

export const TERMINAL_STAGES: readonly CustomerPipelineStage[] = [
  'converted',
  'lost',
];
