import type { CustomerFollowUp, CustomerListItem, CustomerNextAction, CustomerPipelineStage, CustomerReferent } from './customer';

/**
 * TCK-2591 — l'étape que les faits proposent (`suggested_stage`), au seul personnel de l'agence de la
 * fiche ; `reason` nomme le fait, à renvoyer tel quel à `POST …/suggested-stage/dismiss`.
 */
export interface CustomerSuggestedStage {
  readonly to: CustomerPipelineStage;
  readonly reason: 'visit_confirmed' | 'visit_interested' | 'application_created' | 'offer_created' | 'lease_signed';
  readonly at: string;
}

export interface PipelineCustomerCard {
  id: number;
  first_name: string;
  last_name: string;
  phone?: string | null;
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
  /** TCK-2592 — la carte enrichie : dernier contact, prochaine action, relance, référent, proposition. */
  last_contacted_at?: string | null;
  next_action?: CustomerNextAction | null;
  follow_up?: CustomerFollowUp | null;
  referent?: CustomerReferent | null;
  suggested_stage?: CustomerSuggestedStage | null;
  /** TCK-2592 — ce que le client cherche (une ligne), au seul personnel de l'agence de la fiche. */
  seeking_contract_type?: CustomerListItem['seeking_contract_type'];
  budget_max?: CustomerListItem['budget_max'];
  seeking_property_types?: CustomerListItem['seeking_property_types'];
  seeking_cities?: CustomerListItem['seeking_cities'];
  seeking_neighborhoods?: CustomerListItem['seeking_neighborhoods'];
}

export interface PipelineStats {
  /** TCK-2591 — la portée appliquée (`mine`, `agency`, ou `null` : la lecture de la fiche). */
  scope?: 'mine' | 'agency' | null;
  stage_counts: Record<CustomerPipelineStage, number>;
  stage_changes_last_30d: number;
  /** Map of stage → average days a customer spends in that stage. */
  avg_time_in_stage: Record<string, number>;
  /** TCK-2591 — la durée médiane par étape, en jours ; `null` sans passage mesuré. */
  median_days_in_stage?: Partial<Record<CustomerPipelineStage, number | null>>;
  /** Decimal in [0, 1] — Gagné sur les sorties des 30 derniers jours (TCK-2591). */
  conversion_rate: number;
  /** TCK-2591 — les sorties des 30 derniers jours. */
  exits_last_30d?: { readonly converted: number; readonly lost: number };
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
