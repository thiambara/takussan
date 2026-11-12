/**
 * Customer resource — shapes aligned with the backend JSON envelope emitted
 * by `CustomerResource` (see `takussan-api/app/Http/Resources/...`).
 *
 * Fields are kept permissive because the actual response depends on the
 * `fields[customers]` sparse fieldset the caller asked for. Always rely on
 * the fields you explicitly requested when consuming these types.
 */

import type { Tag } from './tag';

export type IdType = 'id_card' | 'passport' | 'driving_license';

export type CustomerStatus = 'active' | 'inactive' | 'blocked' | 'deleted';

export type CustomerPipelineStage =
  | 'lead'
  | 'prospect'
  | 'qualified'
  | 'negotiating'
  | 'converted'
  | 'lost';

export interface CustomerListItem {
  id: number;
  first_name: string;
  last_name: string;
  full_name?: string;
  email: string | null;
  phone: string | null;
  status: CustomerStatus;
  pipeline_stage: CustomerPipelineStage | null;
  occupation?: string | null;
  tags?: Pick<Tag, 'id' | 'name' | 'slug' | 'color'>[];
  created_at: string;
  updated_at?: string;
  /** TCK-591 §5 — critères du prospect (`decimal:2` : les montants arrivent en chaîne). Au seul personnel de l'agence de la fiche. */
  seeking_contract_type?: 'sale' | 'rent' | null;
  budget_min?: string | null;
  budget_max?: string | null;
  seeking_property_types?: string[] | null;
  seeking_cities?: string[] | null;
  seeking_neighborhoods?: string[] | null;
  min_bedrooms?: number | null;
  /** TCK-2588 — calculés pour la page, demandés par `fields[customers]` ; `null` hors personnel. */
  next_action?: CustomerNextAction | null;
  follow_up?: CustomerFollowUp | null;
  referent?: CustomerReferent | null;
}

/** TCK-2588 — la prochaine action : visite ou tâche ; `label` est le titre du bien ou de la tâche. */
export interface CustomerNextAction {
  readonly type: 'visit' | 'task';
  readonly id: number;
  readonly at: string;
  readonly label: string | null;
  readonly overdue: boolean;
}

/** TCK-2588 — la relance due : tâche en retard, compte rendu manquant, ou sans contact depuis `days` jours. */
export interface CustomerFollowUp {
  readonly reason: 'overdue_task' | 'report_missing' | 'no_contact';
  readonly since: string;
  readonly days: number;
}

/** TCK-2588 — le référent : l'agent principal et actif de la fiche. */
export interface CustomerReferent {
  readonly id: number;
  readonly name: string;
}

export interface CustomerDetail extends CustomerListItem {
  birth_date: string | null;
  id_type: IdType | null;
  /** TCK-953 (ADR-0070) — le numéro de pièce masqué (`•••• 8877`) ; la valeur ne sort plus. */
  id_number_masked: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  added_by_id: number | null;
  user_id: number | null;
  metadata: Record<string, unknown> | null;
  agency_id?: number | null;
  /** TCK-921 — la langue des messages du client sans compte ; `null` : `fr`. */
  locale?: 'fr' | 'en' | 'wo' | null;
  /** TCK-2582 — le bien d'intérêt, rendu sous `include=interestedProperty` (TCK-2586). */
  interested_property?: { id: number; title: string; slug: string | null } | null;
}

export interface CustomerNote {
  id: number;
  customer_id: number;
  author_id: number | null;
  author_name?: string | null;
  body: string;
  pinned: boolean;
  /** TCK-591 — nature d'une note d'étape ; le préfixe se rend côté front, dans la langue du lecteur. */
  kind?: 'loss' | 'conversion' | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerDocument {
  id: number;
  name: string;
  type: string;
  size: number;
  url: string;
  uploaded_at: string;
}

export interface CustomerRelationship {
  id: number;
  user_id: number;
  customer_id: number;
  relationship_type: 'owner_tenant' | 'agent_client' | string;
  is_primary: boolean;
  status: 'active' | 'ended' | 'suspended' | string;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  /** Rendu par `GET /api/customers/{id}/relationships` ; le référent se nomme par lui (TCK-591). */
  user?: { id: number; name: string; email: string | null } | null;
}
