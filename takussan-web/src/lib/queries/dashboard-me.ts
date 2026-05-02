import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Server-side fetcher for the adaptive dashboard entry (TCK-032 / TCK-130).
 *
 * Returns `null` when:
 *   - the user isn't authenticated (no token), or
 *   - the backend resolves no profile (HTTP 404).
 *
 * The page renders an empty-state CTA in both cases. Non-404 errors bubble.
 */

export type DashboardMeRole = 'agency_admin' | 'agent' | 'owner' | 'tenant';

export type DashboardMeNextPayment = {
  id: number;
  lease_id: number;
  amount: number;
  currency: string | null;
  due_date: string | null;
  status: string | null;
};

export type DashboardMeRecentDocument = {
  id: number;
  name: string;
  type: string | null;
  created_at: string | null;
};

export type DashboardMePayload = {
  role: DashboardMeRole;
  metrics: Record<string, unknown>;
  sections: string[];
};

export async function fetchDashboardMe(opts: { signal?: AbortSignal } = {}): Promise<{ data: DashboardMePayload } | null> {
  const token = await getToken();
  if (!token) return null;

  try {
    return await apiRequest<{ data: DashboardMePayload }>('/api/dashboard/me', {
      token,
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}
