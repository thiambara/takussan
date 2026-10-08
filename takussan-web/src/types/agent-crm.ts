/**
 * TCK-591 — formes des réponses du CRM de l'agent (journal de la fiche, rapprochement, passation,
 * absences, flux d'agenda, actions en masse). Alignées sur les contrôleurs de `takussan-api`.
 */

export type ActivitySubject = 'customer' | 'note' | 'task' | 'other';

export interface CustomerActivityEntry {
  id: number;
  subject: ActivitySubject;
  subject_id: number | null;
  event: string | null;
  changes: {
    attributes: Record<string, unknown> | null;
    old: Record<string, unknown> | null;
  };
  causer: { id: number; name: string } | null;
  created_at: string;
}

export interface MatchingProperty {
  id: number;
  title: string;
  slug: string | null;
  type: string;
  contract_type: string;
  price: string | number;
  bedrooms: number | null;
  visibility: 'public' | 'private';
  status: string;
  city: string | null;
  neighborhood: string | null;
}

export interface MatchingCustomer {
  /** `null` quand l'appelant ne peut pas lire la fiche : le prospect reste compté, sans nom. */
  id: number | null;
  name: string | null;
  pipeline_stage: string | null;
}

export type PortfolioCategory =
  | 'tasks'
  | 'visits'
  | 'maintenance'
  | 'responsible_properties'
  | 'held_properties'
  | 'collaborations'
  | 'customers';

export interface MemberPortfolio {
  user_id: number;
  portfolio: Record<PortfolioCategory, number>;
  transferable: PortfolioCategory[];
  pending: PortfolioCategory[];
}

export interface AgentAbsence {
  id: number;
  absent: { id: number; name: string } | null;
  substitute: { id: number; name: string } | null;
  starts_at: string | null;
  ends_at: string | null;
  status: 'scheduled' | 'active' | 'expired' | 'revoked';
  reason: string | null;
}

export interface CalendarFeedState {
  active: boolean;
  created_at?: string | null;
  last_accessed_at?: string | null;
  /** Rendu UNE seule fois, à la création ou à la rotation. */
  url?: string;
}

export type BulkFailureReason =
  | 'not_found'
  | 'forbidden'
  | 'unchanged'
  | 'invalid_target'
  | 'invalid_status'
  | 'already_archived';

export interface BulkFailure {
  id: number;
  reason: BulkFailureReason | string;
}

export interface BulkResult {
  updated: number;
  updated_ids: number[];
  /** TCK-603 — `bulk-assign` seulement : la cible était déjà l'agent responsable. Ni un refus, ni un changement. */
  unchanged?: number;
  unchanged_ids?: number[];
  failed: BulkFailure[];
}

/** Une ligne liée à la fiche client (visite, réservation, bail), réduite à ce que l'onglet affiche. */
export interface CustomerLinkedRecord {
  id: number;
  status: string | null;
  /** Visite : `scheduled_at` ; réservation et bail : `start_date`. */
  date: string | null;
  end_date?: string | null;
  reference_number?: string | null;
  property: { id: number; title: string } | null;
}

/** TCK-591 §3 — une tâche de « Mes tâches », avec ce à quoi elle se rattache, en clair. */
export interface AgentTask {
  id: number;
  title: string;
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  due_at: string | null;
  /** `label` et `phone` sont `null` pour qui ne passe pas le contrôle de rattachement. */
  taskable: { type: 'customer' | 'property'; id: number; label: string | null; phone: string | null } | null;
  assignee: { id: number; name: string } | null;
}

export type TaskDue = 'overdue' | 'today' | 'upcoming' | 'none';

export interface TaskableOption {
  id: number;
  label: string;
}

export interface AgencyStaffMember {
  id: number;
  name: string;
}
