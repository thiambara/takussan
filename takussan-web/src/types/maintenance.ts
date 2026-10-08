/**
 * Backend contract: see `takussan-api` →
 *   - `App\Models\Enums\MaintenanceStatus|Priority|Category`
 *   - `App\Http\Resources\MaintenanceRequestResource`
 *   - `routes/api/maintenance-requests.php`
 *
 * Column names follow `docs/models-spec.md §21` (spec is source of truth) —
 * `requester_id`, `assigned_to`, `actual_cost`.
 */

export type MaintenanceStatus =
  | 'open'
  | 'acknowledged'
  | 'quote_requested'
  | 'quote_submitted'
  | 'awaiting_owner'
  | 'approved'
  | 'rejected'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'closed'
  | 'cancelled';

export type MaintenancePriority = 'low' | 'normal' | 'high' | 'urgent';

export type MaintenanceCategory =
  | 'plumbing'
  | 'electrical'
  | 'structural'
  | 'appliance'
  | 'painting'
  | 'cleaning'
  | 'pest_control'
  | 'locksmith'
  | 'other';

export const MAINTENANCE_STATUSES: readonly MaintenanceStatus[] = [
  'open',
  'acknowledged',
  'quote_requested',
  'quote_submitted',
  'awaiting_owner',
  'approved',
  'rejected',
  'assigned',
  'in_progress',
  'completed',
  'closed',
  'cancelled',
] as const;

export const MAINTENANCE_PRIORITIES: readonly MaintenancePriority[] = [
  'low',
  'normal',
  'high',
  'urgent',
] as const;

export const MAINTENANCE_CATEGORIES: readonly MaintenanceCategory[] = [
  'plumbing',
  'electrical',
  'structural',
  'appliance',
  'painting',
  'cleaning',
  'pest_control',
  'locksmith',
  'other',
] as const;

/**
 * TCK-592 — la table de transitions recopiée ici est PARTIE : elle proposait au prestataire
 * « Approuver » son propre devis et, après un refus, un bouton qui partait en `PUT …/status` vers
 * une cible que l'API refuse (422 garanti). Chaque action naît désormais de
 * {@link MaintenanceAbilities}, que l'API calcule pour l'utilisateur qui lit la fiche.
 */

export interface MaintenancePropertySummary {
  readonly id: number;
  readonly title: string;
  readonly slug: string | null;
  /** TCK-592 — chargée par la liste (`include=property`) : « Mes interventions » nomme l'agence. */
  readonly agency?: { readonly id: number; readonly name: string } | null;
  readonly location?: {
    readonly full?: string | null;
    readonly quarter?: string | null;
    readonly city?: string | null;
    readonly region?: string | null;
    readonly country?: string | null;
  } | null;
}

export interface MaintenanceUserSummary {
  readonly id: number;
  readonly name: string | null;
  readonly email?: string | null;
  readonly username?: string | null;
}

/**
 * TCK-592 — ce que CET utilisateur peut faire sur CETTE demande, calculé par l'API
 * (`MaintenanceRequestResource::abilitiesBlock`). Rendu sur la fiche seulement.
 */
export interface MaintenanceAbilities {
  readonly can_manage_quotes: boolean;
  readonly can_request_quote: boolean;
  readonly can_decide_quote: boolean;
  readonly can_view_quote_pdf: boolean;
  readonly can_submit_quote: boolean;
  readonly can_accept: boolean;
  readonly can_decline: boolean;
  readonly can_assign: boolean;
  readonly can_complete: boolean;
  readonly can_upload_before_photos: boolean;
  readonly can_confirm_resolution: boolean;
  readonly can_contest_resolution: boolean;
  /** Les seules cibles de `PUT …/status` que cet utilisateur peut demander. */
  readonly transitions: readonly MaintenanceStatus[];
}

export interface MaintenanceMediaItem {
  readonly id: number;
  readonly name: string;
  readonly mime_type: string | null;
  readonly size: number | null;
  /** URL d'API signée : elle se télécharge sans jeton, et expire. */
  readonly url: string;
  readonly created_at: string | null;
}

export interface MaintenanceMedia {
  readonly photos: readonly MaintenanceMediaItem[];
  readonly before_photos: readonly MaintenanceMediaItem[];
  readonly completion_photos: readonly MaintenanceMediaItem[];
  /** Absent pour le demandeur qui n'est que demandeur. */
  readonly quotes?: readonly MaintenanceMediaItem[];
}

/** Le kit d'accès : au prestataire assigné, après acceptation, tant que rien n'est clos. */
export interface MaintenanceAccess {
  readonly street: string | null;
  readonly quarter: string | null;
  readonly city: string | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly requester_phone: string | null;
  readonly instructions: string | null;
}

export type MaintenanceQuoteLineKind = 'labour' | 'supply';

export interface MaintenanceQuoteLine {
  readonly label: string;
  readonly kind: MaintenanceQuoteLineKind;
  /** Chaînes décimales : le montant est calculé côté serveur, en `bcmath`. */
  readonly quantity: string;
  readonly unit_price: string;
  readonly total: string;
}

export interface MaintenanceRequest {
  readonly id: number;
  readonly property_id: number;
  readonly lease_id: number | null;
  readonly requester_id: number;
  readonly assigned_to: number | null;
  readonly title: string;
  readonly description: string;
  readonly category: MaintenanceCategory;
  readonly priority: MaintenancePriority;
  readonly status: MaintenanceStatus;
  readonly estimated_cost: number | null;
  readonly actual_cost: number | null;
  readonly quote_amount: number | null;
  readonly quote_currency: string | null;
  readonly quote_submitted_at: string | null;
  readonly quote_decision_at: string | null;
  readonly quote_decision_by_id: number | null;
  readonly quote_rejection_reason: string | null;
  readonly quote_lines?: readonly MaintenanceQuoteLine[] | null;
  readonly quote_valid_until?: string | null;
  readonly quote_estimated_duration_days?: number | null;
  readonly accepted_at?: string | null;
  readonly access_instructions?: string | null;
  readonly scheduled_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly resolution_notes: string | null;
  readonly property?: MaintenancePropertySummary | null;
  readonly requester?: MaintenanceUserSummary | null;
  readonly assignee?: MaintenanceUserSummary | null;
  readonly quote_decision_by?: MaintenanceUserSummary | null;
  readonly created_at: string;
  readonly abilities?: MaintenanceAbilities;
  readonly media?: MaintenanceMedia;
  readonly access?: MaintenanceAccess;
  /** Le fil de l'intervention, si l'utilisateur y participe (« Discuter »). */
  readonly conversation_id?: number | null;
}
