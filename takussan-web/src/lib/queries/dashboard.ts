import { apiRequest, buildQueryString } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Server-side fetchers for the role-based dashboards (TCK-032 P1).
 *
 * All endpoints are already returning aggregates; we simply forward the
 * spatie-style params we want (include=timeseries, months=…, fields[summary]).
 * Each function returns `null` when the user isn't authenticated — callers
 * render a login redirect in that case.
 */

export type PeriodWindow = { start: string; end: string };

export type AgencyDashboard = {
  agency_id: number;
  period: PeriodWindow;
  properties?: { total: number; published: number; rented: number; available: number };
  leases?: { active: number };
  customers_count?: number;
  members_count?: number;
  bookings?: { pending: number };
  maintenance?: { open: number };
  finance?: {
    revenue_month: number;
    commission_month: number;
    overdue_count: number;
    overdue_amount: number;
    unpaid_rate_percent: number;
  };
  occupancy?: { rate_percent: number };
};

export type OwnerDashboard = {
  owner_id: number;
  period: PeriodWindow;
  portfolio?: { total: number; rented: number; available: number };
  leases?: { active: number };
  bookings?: { pending: number };
  finance?: {
    cashflow_month: number;
    expected_monthly: number;
    overdue_count: number;
    overdue_amount: number;
  };
  occupancy?: { rate_percent: number };
};

export type AgentDashboard = {
  agent_id: number;
  agency_id: number | null;
  period: PeriodWindow;
  properties_managed?: number;
  pipeline?: Record<string, number>;
  bookings?: { pending: number };
  visits?: {
    upcoming_7d: number;
    today?: number;
    today_items?: Array<{
      id: number;
      scheduled_at: string | null;
      status: string | null;
      property: { id: number; title: string } | null;
      requester: { id?: number; name: string | null } | null;
    }>;
  };
  finance?: { commissions_month: number; commissions_year?: number };
  tasks?: {
    open: number;
    overdue: number;
    today?: number;
    items?: Array<{
      id: number;
      title: string;
      priority: string | null;
      due_at: string | null;
      customer: { id: number; name: string } | null;
    }>;
  };
  pipeline_ops?: {
    pending_bookings: number;
    leases_to_sign: number;
    tasks_today: number;
  };
  recent_activity?: Array<{
    id: number;
    label: string;
    type: string;
    at: string | null;
  }>;
  maintenance?: { open: number };
};

export type TenantDashboard = {
  tenant_id: number;
  customer_id: number | null;
  has_customer_profile: boolean;
  leases: { active: number };
  bookings: { pending: number };
  payments: {
    next_due:
      | {
          id: number;
          lease_id: number;
          amount: number;
          currency: string | null;
          due_date: string | null;
          status: string | null;
        }
      | null;
    upcoming_30d: Array<{
      id: number;
      lease_id: number;
      amount: number;
      currency: string | null;
      due_date: string | null;
      status: string | null;
    }>;
    overdue_count: number;
    overdue_amount: number;
  };
  maintenance: { open: number };
  documents: { recent: Array<{ id: number; name: string; type: string | null; created_at: string | null }> };
};

export type TimeseriesPayload = {
  months: string[];
} & Record<string, number[] | string[]>;

export type DashboardEnvelope<T> = { data: T; timeseries?: TimeseriesPayload };

type FetchOpts = {
  include?: string[];
  months?: number;
  signal?: AbortSignal;
};

async function call<T>(path: string, opts: FetchOpts = {}): Promise<DashboardEnvelope<T> | null> {
  const token = await getToken();
  if (!token) return null;

  const qs = buildQueryString({
    include: opts.include,
    extra: typeof opts.months === 'number' ? { months: opts.months } : undefined,
  });

  const url = `/api${path}${qs ? `?${qs}` : ''}`;

  return apiRequest<DashboardEnvelope<T>>(url, { token, signal: opts.signal });
}

export function fetchAgencyDashboard(opts?: FetchOpts) {
  return call<AgencyDashboard>('/dashboard/agency', { include: ['timeseries'], months: 12, ...opts });
}

export function fetchOwnerDashboard(opts?: FetchOpts) {
  return call<OwnerDashboard>('/dashboard/owner', { include: ['timeseries'], months: 12, ...opts });
}

export function fetchAgentDashboard(opts?: FetchOpts) {
  return call<AgentDashboard>('/dashboard/agent', { include: ['timeseries'], months: 12, ...opts });
}

export function fetchTenantDashboard(opts?: FetchOpts) {
  return call<TenantDashboard>('/dashboard/tenant', opts);
}
