/**
 * TCK-266 — TenantOnboardingChecklist payloads.
 *
 * Mirrors `App\Models\TenantOnboardingChecklist` (cf. `docs/models-spec.md#50`).
 * The four `*_at` columns are nullable timestamps; `completed_at` is set
 * server-side when the two REQUIRED items (`inventory_completed_at` +
 * `first_payment_at`) are both non-null.
 */
export type TenantOnboardingChecklistItem =
  | 'welcome_seen'
  | 'inventory_completed'
  | 'first_payment'
  | 'documents_acknowledged';

export type TenantOnboardingChecklist = {
  id: number;
  lease_id: number;
  user_id: number;
  welcome_seen_at: string | null;
  inventory_completed_at: string | null;
  first_payment_at: string | null;
  documents_acknowledged_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};
