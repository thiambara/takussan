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
  /** TCK-2669 (ADR-0104 § 5) — la demande refusée que celle-ci reprend ; absente d'une réponse antérieure. */
  readonly resubmit_of_id?: number | null;
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

/**
 * TCK-2671 — l'offre du passage en pro, lue de l'API (`GET /api/me/upgrade-offer`, TCK-2669) : le
 * prix ne s'écrit jamais dans le code (décision 14). Réservée à l'admin d'une agence `individual`
 * (403 sinon) ; 404 `plan.upgrade_offer_missing` quand le plan est absent ou retiré.
 */
export interface OffreDePassage {
  readonly code: string;
  readonly label: string;
  readonly monthly_price_xof: number;
  readonly platform_fee_pct: number;
  readonly limits: Readonly<Record<string, number>>;
}
