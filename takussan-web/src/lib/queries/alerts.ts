import { apiRequest, buildQueryString } from '@/lib/api';
import { cheminApi, requete } from '@/lib/chemin-api';
import { getToken } from '@/lib/session';
import type { PaginatedResponse } from '@/types/api';
import type { ThresholdAlert } from '@/types/alert';
import { lireToutesLesPages, PAR_PAGE_MAX } from './toutes-les-pages';

/**
 * Server wrappers around /api/threshold-alerts (TCK-032 P3).
 */

// TCK-2868 — types et `CANAUX_D_ALERTE` vivent dans `@/types/alert`, importable par un composant
// client ; ce module serveur (il tire `lib/session.ts`) ne fait que les ré-exporter.
export { CANAUX_D_ALERTE } from '@/types/alert';
export type { AlertChannel, ThresholdAlert, ThresholdAlertInput } from '@/types/alert';

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
