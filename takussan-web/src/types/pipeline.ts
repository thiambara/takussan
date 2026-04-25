import type { CustomerPipelineStage } from './customer';

export interface PipelineCustomerCard {
  id: number;
  first_name: string;
  last_name: string;
  pipeline_stage: CustomerPipelineStage;
  updated_at: string;
  created_at: string;
  added_by_id: number | null;
  /** spatie `withCount('tasks')` — only present when `include=tasksCount`. */
  tasks_count?: number;
  added_by?: {
    id: number;
    first_name?: string;
    last_name?: string;
    full_name?: string;
  } | null;
}

export interface PipelineStats {
  stage_counts: Record<CustomerPipelineStage, number>;
  stage_changes_last_30d: number;
  /** Map of stage → average days a customer spends in that stage. */
  avg_time_in_stage: Record<string, number>;
  /** Decimal in [0, 1]. */
  conversion_rate: number;
}

export type TaskStatus = 'open' | 'in_progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high';

export interface Task {
  id: number;
  title: string;
  description?: string | null;
  taskable_id: number | null;
  taskable_type: string | null;
  assignee?: { id: number; name: string } | null;
  creator?: { id: number; name: string } | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
}
