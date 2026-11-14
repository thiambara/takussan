import { ApiError, apiRequest } from '@/lib/api';
import { getToken } from '@/lib/session';
import { cheminApi } from '@/lib/chemin-api';
import type { PeriodeDesRapports } from '@/lib/rapports/periode';

/**
 * Server-side fetcher for the agency dashboard endpoint (TCK-032 / TCK-131).
 *
 * Returns `null` when the user is not authorised to read the agency report
 * (HTTP 403) or no agency context resolves (HTTP 404). Both signals are
 * surfaced as the same "degraded" state in the UI per the AC. Other errors
 * bubble.
 */

/**
 * TCK-2373 (P249.02) — un indicateur que l'agence a configuré dans l'écran « Indicateurs »
 * (`kpi_configs`), avec la valeur que l'API calcule. Un format `percent` porte des points (0..100),
 * comme les métriques `*_percent` ; `value` vaut `null` sans dénominateur.
 */
export type DashboardAgencyKpi = {
  metric: string;
  label: string;
  format: 'number' | 'percent' | 'currency';
  value: number | null;
  /** TCK-2791 — la tuile dit l'état du jour, pas le mois servi. */
  as_of_today?: boolean;
};

export type DashboardAgencySummary = {
  agency_id: number;
  /**
   * TCK-2791 — `key` : la période servie ; `as_of_today` : les chemins des chiffres qui restent l'état du jour,
   * quelle que soit la période (absents d'une réponse d'avant TCK-2791).
   */
  period: { start: string; end: string; key?: PeriodeDesRapports; as_of_today?: string[] };
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
    /** P206.03 (ADR-0057, amendement du 2026-10-24) — pénalités appliquées non réglées, à part de l'impayé. */
    late_fees_outstanding_count?: number;
    late_fees_outstanding_amount?: number;
    /** Impayé ÷ facturé des échéances échues sur 12 mois, en points ; `null` sans échéance (TCK-1177). */
    unpaid_rate_percent: number | null;
  };
  /** `null` sans bien éligible longue durée : pas de dénominateur (TCK-1114). */
  /** TCK-2626 — la base du taux (biens en location longue, et ceux occupés aujourd'hui) : « 18 loués sur 23 » (TCK-2628, AC4). */
  occupancy: { rate_percent: number | null; eligible_count?: number; occupied_count?: number };
  /** TCK-2373 — les indicateurs activés, dans l'ordre ; vide sans configuration (tuiles par défaut). */
  kpis?: DashboardAgencyKpi[];
};

export type DashboardAgencyTimeseries = {
  months: string[];
  revenue: number[];
  /** `null` pour un mois sans bien éligible longue durée (P127.02, TCK-1355). */
  occupancy: (number | null)[];
};

export type DashboardAgencyPayload = {
  data: DashboardAgencySummary;
  timeseries?: DashboardAgencyTimeseries;
};

type FetchOptions = {
  signal?: AbortSignal;
  withTimeseries?: boolean;
  months?: number;
  /** TCK-2791 — le mois résumé ; le mois en cours n'écrit rien. */
  period?: PeriodeDesRapports;
};

export async function fetchDashboardAgency(
  opts: FetchOptions = {},
): Promise<DashboardAgencyPayload | null> {
  const token = await getToken();
  if (!token) return null;

  const params = new URLSearchParams();
  if (opts.period === 'last_month') params.set('period', opts.period);
  if (opts.withTimeseries) {
    params.set('include', 'timeseries');
    if (opts.months) params.set('months', String(opts.months));
  }
  const qs = params.toString();
  const path = qs ? cheminApi`/api/dashboard/agency?${qs}` : '/api/dashboard/agency';

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
