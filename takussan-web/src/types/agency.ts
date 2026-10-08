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
 *
 * TCK-601 (A2) — `legal_info.rib_pro` n'existe plus : le flip ne le recopie plus, la migration
 * l'a retiré des données et `AgencyResource` ne le rend jamais. La seule source du RIB pro est la
 * demande de passage (`types/agency-upgrade.ts`), chiffrée en base et lisible du seul admin de
 * l'agence et du super-admin. Ne pas le rajouter ici : ce type est celui que tout membre lit.
 */
export interface AgencyMetadata {
  legal_info?: {
    rc?: string | null;
    ninea?: string | null;
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
  /** TCK-589 — second facteur exigé de chaque membre de l'agence. */
  require_team_two_factor?: boolean;
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
  primary_admin_id: number | null;
  created_at?: string;
}
