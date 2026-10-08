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
    lease_income_month?: number;
    booking_income_month?: number;
    net_paid_out_month?: number;
    deposits_held?: number;
  };
  occupancy?: { rate_percent: number; short_stay_percent?: number | null };
  /** TCK-595 (AC8) — les nombres des cartes actionnables. */
  maintenance?: { quotes_pending: number };
  visits?: { to_confirm: number };
  reviews?: { unanswered: number };
};

/** TCK-595 (ADR-0049 §4) — `mine` : les chiffres de l'agent ; `agency` : ceux de son agence. */
export type AgentDashboardScope = 'mine' | 'agency';

export type AgentDashboard = {
  agent_id: number;
  agency_id: number | null;
  scope?: AgentDashboardScope;
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
  /** TCK-595 (AC16) — les 5 prochaines visites du client. */
  visits?: {
    upcoming: Array<{
      id: number;
      scheduled_at: string | null;
      status: string | null;
      property: { id: number; title: string } | null;
    }>;
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
  /** TCK-595 — n'a de sens que pour `/dashboard/agent`. */
  scope?: AgentDashboardScope;
  signal?: AbortSignal;
};

async function call<T>(path: string, opts: FetchOpts = {}): Promise<DashboardEnvelope<T> | null> {
  const token = await getToken();
  if (!token) return null;

  const extra: Record<string, string | number> = {};
  if (typeof opts.months === 'number') extra.months = opts.months;
  if (opts.scope) extra.scope = opts.scope;
  const qs = buildQueryString({
    include: opts.include,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
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

/**
 * TCK-595 — les capacités de l'utilisateur dans son agence active, lues côté serveur
 * (`GET /api/me/capabilities`, le même point que `useCan`). La vue agent n'offre la bascule
 * « Agence » qu'à qui détient `reports.view_agency` : un bouton qui mène à un 403 n'est pas une
 * option. Une erreur rend la liste vide — la bascule disparaît, la vue personnelle reste.
 */
export async function fetchMyCapabilities(): Promise<readonly string[]> {
  const token = await getToken();
  if (!token) return [];
  try {
    const response = await apiRequest<{ data: { capabilities: readonly string[] } }>(
      '/api/me/capabilities',
      { token },
    );
    return response.data.capabilities ?? [];
  } catch {
    return [];
  }
}
