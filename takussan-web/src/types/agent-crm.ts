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
  | 'collaborations'
  | 'customers'
  | 'held_properties';

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
  | 'already_archived';

export interface BulkFailure {
  id: number;
  reason: BulkFailureReason | string;
}

export interface BulkResult {
  updated: number;
  updated_ids: number[];
  failed: BulkFailure[];
}
