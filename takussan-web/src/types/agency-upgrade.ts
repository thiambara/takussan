/**
 * TCK-267 — `AgencyUpgradeRequest` types.
 *
 * Source of truth: `takussan-api/app/Http/Resources/AgencyUpgradeRequestResource.php`.
 * The status enum mirrors `App\Models\Enums\AgencyUpgradeRequestStatus`.
 */

export type AgencyUpgradeRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'revoked';

export interface AgencyUpgradeRequest {
  readonly id: number;
  readonly agency_id: number;
  readonly submitted_by: number;
  readonly rc: string | null;
  readonly ninea: string | null;
  readonly rib_pro: string | null;
  readonly company_legal_name: string | null;
  readonly address_fiscale: string | null;
  readonly planned_agents_count: number | null;
  readonly status: AgencyUpgradeRequestStatus;
  readonly submitted_at: string | null;
  readonly reviewed_by: number | null;
  readonly reviewed_at: string | null;
  readonly review_comment: string | null;
  readonly created_at: string | null;
  readonly updated_at: string | null;
}

/** Form payload — `statuts_doc` is sent separately as the file part of the
 * multipart upload (see {@link submitAgencyUpgradeRequest}). */
export interface AgencyUpgradeRequestFormFields {
  readonly rc: string;
  readonly ninea: string;
  readonly rib_pro: string;
  readonly company_legal_name: string;
  readonly address_fiscale: string;
  readonly planned_agents_count: number | null;
}
