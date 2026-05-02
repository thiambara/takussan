import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Server-side fetcher for the agency dashboard endpoint (TCK-032 / TCK-131).
 *
 * Returns `null` when the user is not authorised to read the agency report
 * (HTTP 403) or no agency context resolves (HTTP 404). Both signals are
 * surfaced as the same "degraded" state in the UI per the AC. Other errors
 * bubble.
 */

export type DashboardAgencySummary = {
  agency_id: number;
  period: { start: string; end: string };
  properties: {
    total: number;
    published: number;
    rented: number;
    available: number;
  };
  leases: { active: number };
  customers_count: number;
  members_count: number;
  bookings: { pending: number };
  maintenance: { open: number };
  finance: {
    revenue_month: number;
    commission_month: number;
    overdue_count: number;
    overdue_amount: number;
    unpaid_rate_percent: number;
  };
  occupancy: { rate_percent: number };
};

export type DashboardAgencyTimeseries = {
  months: string[];
  revenue: number[];
  occupancy: number[];
};

export type DashboardAgencyPayload = {
  data: DashboardAgencySummary;
  timeseries?: DashboardAgencyTimeseries;
};

type FetchOptions = {
  signal?: AbortSignal;
  withTimeseries?: boolean;
  months?: number;
};

export async function fetchDashboardAgency(
  opts: FetchOptions = {},
): Promise<DashboardAgencyPayload | null> {
  const token = await getToken();
  if (!token) return null;

  const params = new URLSearchParams();
  if (opts.withTimeseries) {
    params.set('include', 'timeseries');
    if (opts.months) params.set('months', String(opts.months));
  }
  const qs = params.toString();
  const path = qs ? `/api/dashboard/agency?${qs}` : '/api/dashboard/agency';

  try {
    return await apiRequest<DashboardAgencyPayload>(path, {
      token,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof ApiError && (err.status === 403 || err.status === 404)) {
      return null;
    }
    throw err;
  }
}
