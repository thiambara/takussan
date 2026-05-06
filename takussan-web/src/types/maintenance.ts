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
 * Allowed forward transitions — mirrors
 * `App\Services\Model\MaintenanceRequestService::TRANSITIONS`.
 * Terminal states (`closed`, `cancelled`) intentionally absent.
 */
export const MAINTENANCE_TRANSITIONS: Readonly<
  Record<MaintenanceStatus, readonly MaintenanceStatus[]>
> = {
  open: ['acknowledged', 'assigned', 'in_progress', 'cancelled', 'quote_requested'],
  quote_requested: ['quote_submitted'],
  rejected: ['quote_submitted'],
  quote_submitted: ['approved', 'rejected'],
  approved: ['in_progress'],
  acknowledged: ['assigned', 'in_progress', 'cancelled'],
  assigned: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: ['closed'],
  closed: [],
  cancelled: [],
} as const;

export interface MaintenancePropertySummary {
  readonly id: number;
  readonly title: string;
  readonly slug: string | null;
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
  readonly scheduled_at: string | null;
  readonly started_at: string | null;
  readonly completed_at: string | null;
  readonly resolution_notes: string | null;
  readonly property?: MaintenancePropertySummary | null;
  readonly requester?: MaintenanceUserSummary | null;
  readonly assignee?: MaintenanceUserSummary | null;
  readonly quote_decision_by?: MaintenanceUserSummary | null;
  readonly created_at: string;
}
