/**
 * Agency types — TCK-015 / TCK-064.
 *
 * Source of truth: `takussan-api/app/Http/Resources/AgencyResource.php`.
 * Keep the optional fields aligned with what the backend actually returns
 * (sparse fieldsets may omit some keys).
 */

export type AgencyStatus = 'active' | 'inactive' | 'suspended' | 'pending';

/** TCK-248 — agency typology. `individual` is a sole-host (no portfolio of
 *  external owners), `standard` is the multi-owner agency. */
export type AgencyKind = 'standard' | 'individual';

/**
 * TCK-269 — JSON metadata bag carried verbatim by `AgencyResource.metadata`.
 * `legal_info.*` is backfilled by the agency-upgrade flow when a
 * super-admin approves the request; `welcome.standard_unlocked_at` is
 * stamped at the same moment so the agency-admin welcome modale fires once.
 */
export interface AgencyMetadata {
  legal_info?: {
    rc?: string | null;
    ninea?: string | null;
    rib_pro?: string | null;
    company_legal_name?: string | null;
    address_fiscale?: string | null;
    [key: string]: unknown;
  };
  welcome?: {
    /** ISO-8601 timestamp set when the agency was flipped to `standard`. */
    standard_unlocked_at?: string | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AgencySettings {
  /** Stored under `settings.default_commission_rate` (fallback to top-level `commission_rate`). */
  default_commission_rate?: number | null;
  currency?: string | null;
  timezone?: string | null;
  /**
   * TCK-593 — l'agence encaisse la pénalité de retard AVEC le loyer payé en ligne. Absente = non :
   * une agence neuve n'encaisse que le loyer, la pénalité se règle auprès d'elle.
   */
  late_fee_online_collection?: boolean;
  [key: string]: unknown;
}

export interface Agency {
  id: number;
  name: string;
  slug: string;
  license_number: string | null;
  description: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  commission_rate: number | null;
  /**
   * TCK-084 — agency-level default currency. Populated by `AgencyResource`;
   * falls back to `XOF` server-side for legacy rows. Use {@link
   * useAgencyCurrency} on the client to consume it without re-fetching.
   */
  currency?: string;
  is_verified: boolean;
  status: AgencyStatus | null;
  /** TCK-248 — typology that gates owner-invitation features (TCK-256). */
  kind?: AgencyKind;
  properties_count?: number;
  active_leases_count?: number;
  average_rating?: number | null;
  logo_url: string | null;
  settings: AgencySettings | null;
  /** TCK-269 — JSON bag, exposes `welcome.standard_unlocked_at` and `legal_info.*`. */
  metadata?: AgencyMetadata | null;
  /** TCK-098 — when true, new property publications require admin approval. */
  moderation_required?: boolean;
  /** TCK-594 (ADR-0039 §4) — au-dessus de ce net, un reversement attend une seconde personne. `null` = désactivé. */
  payout_approval_threshold?: number | null;
  /** TCK-594 (ADR-0039 §7) — TVA appliquée par défaut aux factures (un taux explicite gagne). */
  default_tax_rate?: number | null;
  /** TCK-594 (ADR-0039 §7) — mentions légales imprimées sur les factures ; jamais pour une agence `individual`. */
  legal_name?: string | null;
  ninea?: string | null;
  rccm?: string | null;
  legal_address?: string | null;
  primary_admin_id: number | null;
  created_at?: string;
}
