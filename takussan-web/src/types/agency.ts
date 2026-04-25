/**
 * Agency types — TCK-015 / TCK-064.
 *
 * Source of truth: `takussan-api/app/Http/Resources/AgencyResource.php`.
 * Keep the optional fields aligned with what the backend actually returns
 * (sparse fieldsets may omit some keys).
 */

export type AgencyStatus = 'active' | 'inactive' | 'suspended' | 'pending';

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
  properties_count?: number;
  active_leases_count?: number;
  average_rating?: number | null;
  logo_url: string | null;
  settings: AgencySettings | null;
  primary_admin_id: number | null;
  created_at?: string;
}
