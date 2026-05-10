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

export interface AgencySettings {
  /** Stored under `settings.default_commission_rate` (fallback to top-level `commission_rate`). */
  default_commission_rate?: number | null;
  currency?: string | null;
  timezone?: string | null;
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
  /** TCK-098 — when true, new property publications require admin approval. */
  moderation_required?: boolean;
  primary_admin_id: number | null;
  created_at?: string;
}
