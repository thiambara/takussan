import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';

/**
 * Server-side fetcher for the adaptive dashboard entry (TCK-032 / TCK-130).
 *
 * Returns `null` when the user isn't authenticated (no token). A 404 is still read as `null` for an
 * older API, but TCK-595 made `/dashboard/me` answer every account: one without any other role gets the
 * `tenant` view, and {@link aDesChiffres} decides whether there is anything to show. Non-404 errors bubble.
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

/**
 * TCK-595 (verif-595 m5) — l'accueil `/app` a-t-il des chiffres à montrer ? `/dashboard/me` ne rend plus
 * 404 : un compte neuf ou un prestataire pur reçoit la vue client. Sans fiche client
 * (`has_customer_profile: false`), il n'a rien à y lire : l'accueil garde l'état vide et son appel à
 * explorer, au lieu de tuiles à zéro (« Baux actifs 0 »).
 */
export function aDesChiffres(
  payload: { data: DashboardMePayload } | null,
): payload is { data: DashboardMePayload } {
  if (!payload?.data) return false;
  return !(payload.data.role === 'tenant' && payload.data.metrics.has_customer_profile === false);
}
