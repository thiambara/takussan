import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { PaginatedResponse } from '@/types/api';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * Server wrappers around /api/threshold-alerts (TCK-032 P3).
 */

export type ThresholdAlert = {
  id: number;
  agency_id: number;
  metric: string;
  operator: '>' | '<' | '>=' | '<=';
  threshold: number | string;
  severity: 'info' | 'warning' | 'critical';
  is_enabled: boolean;
  cooldown_hours: number;
  last_triggered_at: string | null;
  last_value: number | string | null;
  /**
   * TCK-2627 — la valeur ACTUELLE de la mesure (`ThresholdAlertReading`), `null` sans dénominateur ou
   * pour un chiffre consolidé que le lecteur ne lit pas : jamais 0 à sa place.
   */
  current_value?: number | null;
  /** TCK-2627/TCK-2723 — qui est prévenu : le compte, et les noms au seul lecteur qui peut modifier l'alerte. */
  recipients?: { count: number; users: { id: number; name: string | null }[] };
  /** TCK-2627 — les canaux de l'événement (`inapp`, `email`), sans les préférences de chacun. */
  channels?: string[];
  /** TCK-2627 — `include=triggers` : les dix derniers déclenchements, le plus récent d'abord. */
  triggers?: { at: string | null; value: number | null }[];
};

export type ThresholdAlertInput = {
  metric: string;
  operator: ThresholdAlert['operator'];
  threshold: number;
  severity?: ThresholdAlert['severity'];
  is_enabled?: boolean;
  cooldown_hours?: number;
};

export async function fetchThresholdAlerts(): Promise<{ data: ThresholdAlert[] } | null> {
  const token = await getToken();
  if (!token) return null;
  // TCK-2003 (P171.02) — toutes les pages : sans `per_page`, l'API rendait 15 alertes, et la 16ᵉ
  // agissait sans pouvoir être vue, modifiée ni supprimée depuis la page.
  return lireToutesLesPages((page) =>
    apiRequest<PaginatedResponse<ThresholdAlert>>(
      // TCK-2629 — `include=triggers` : « Dernier déclenchement » et les déclenchements récents de l'onglet.
      cheminApi`/api/threshold-alerts${requete(buildQueryString({ page, per_page: PAR_PAGE_MAX, include: ['triggers'] }))}`,
      { token },
    ),
  );
}

// TCK-292 (2026-08-22) — `createThresholdAlert` et `deleteThresholdAlert` ont été SUPPRIMÉES,
// pas excusées. Elles portaient `throw new Error('Not authenticated')` et n'avaient AUCUN
// appelant (`grep -rnE '\bcreateThresholdAlert\b' src/` → la définition seule) : les vraies
// écritures vivent dans `src/app/actions/alerts.ts`, qui refait l'appel lui-même et traduit son
// message par `getTranslations('errors')`. Ne subsistent ici que la lecture, réellement appelée
// par `components/rapports/vues/OngletAlertes.tsx` (TCK-2628), et les types que l'action importe.
