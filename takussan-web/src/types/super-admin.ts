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
