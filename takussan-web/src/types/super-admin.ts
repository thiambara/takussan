export type AdminAgency = {
  id: number;
  name: string;
  slug: string;
  status: 'active' | 'inactive' | 'suspended' | null;
  is_verified: boolean;
  verified_at: string | null;
  primary_admin_id: number | null;
  license_number: string | null;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

export type AdminAgenciesResponse = {
  data: AdminAgency[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
};

export type AdminAgencyDetail = AdminAgency & {
  website: string | null;
  description: string | null;
  commission_rate: number | null;
  currency: string | null;
  founded_at: string | null;
  logo_url: string | null;
  public_url: string;
  primary_admin: {
    id: number;
    full_name: string;
    email: string;
  } | null;
  address: {
    line1: string | null;
    line2: string | null;
    city: string | null;
    region: string | null;
    country: string | null;
  } | null;
};

export type AdminAgencyDetailResponse = { data: AdminAgencyDetail };

export type AdminAgencyHealth = {
  active_properties: number;
  properties_in_moderation: number;
  transactions_30d: number;
  revenue_30d: number;
  last_platform_payment_at: string | null;
  open_complaints: number;
};

export type AdminAgencyHealthResponse = { data: AdminAgencyHealth };

export type AdminAgencyTeamMember = {
  id: number;
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  email: string;
  status: string | null;
  roles: string[];
  last_login_at: string | null;
};

export type AdminAgencyTeamResponse = {
  data: AdminAgencyTeamMember[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
};

export type AgencyProvisioningResponse = {
  data: {
    agency: {
      id: number;
      name: string;
      slug: string;
      status: string | null;
      is_verified: boolean;
      primary_admin_id: number | null;
    };
    admin: {
      id: number;
      first_name: string | null;
      last_name: string | null;
      full_name: string;
      email: string;
      preferred_language: string | null;
    };
  };
};

export type SystemMetrics = {
  agencies: {
    total: number;
    verified: number;
    active: number;
    suspended: number;
    verification_rate: number;
  };
  users: {
    total: number;
    active: number;
  };
  properties: {
    published: number;
    pending_review: number;
  };
  leases: {
    active: number;
  };
  revenue: {
    platform_total_paid: number;
    currency: string;
  };
  generated_at: string;
};

export type SystemMetricsResponse = { data: SystemMetrics };

export type ImpersonationStartResponse = {
  token: string;
  expires_at: string;
  actor_id: number;
  target_user_id: number;
};

export type ImpersonationStopResponse = {
  message: string;
  revoked_count: number;
};

export type AuditLogEntry = {
  id: number;
  log_name: string | null;
  event: string | null;
  description: string | null;
  causer_type: string | null;
  causer_id: number | null;
  subject_type: string | null;
  subject_id: number | null;
  properties: Record<string, unknown> | null;
  created_at: string | null;
};

export type AuditLogResponse = {
  data: AuditLogEntry[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
};

/**
 * TCK-132 — row shape for the cross-tenant properties table. Only fields the
 * UI actually renders, fed by `fields[properties]=...&include=address,agency`
 * (see `ADMIN_PROPERTY_FIELDS`).
 */
export type AdminPropertyRow = {
  id: number;
  reference_number: string;
  title: string;
  slug: string;
  type: string | null;
  status: string | null;
  status_label: string | null;
  visibility: string | null;
  contract_type: string | null;
  price: number;
  currency: string | null;
  published_at: string | null;
  created_at: string;
  location: {
    city: string | null;
    region: string | null;
    country: string | null;
  };
  agency: { id: number; name: string; slug: string } | null;
};

export type AdminPropertiesResponse = {
  data: AdminPropertyRow[];
  meta: {
    total: number;
    current_page: number;
    last_page: number;
    per_page: number;
  };
};
