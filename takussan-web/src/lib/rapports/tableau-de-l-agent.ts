import { capacitesDuProfilActif } from '@/lib/access/pages-admin-server';
import { porteeTransmise } from '@/lib/navigation/rapports';
import { fetchAgentDashboard, type AgentDashboardScope } from '@/lib/queries/dashboard';
import type { PeriodeDesRapports } from '@/lib/rapports/periode';

/**
 * TCK-595 (ADR-0049 §4) — « Moi » par défaut ; « Agence » seulement pour qui détient
 * `reports.view_agency`. Un `?scope=agency` saisi à la main sans la capacité retombe sur la vue
 * personnelle au lieu de rendre l'erreur de l'API.
 */
export const CAPACITE_AGENCE = 'reports.view_agency';

export interface TableauDeLAgent {
  readonly payload: Awaited<ReturnType<typeof fetchAgentDashboard>>;
  /** La bascule « Moi / Agence » n'est offerte qu'avec la capacité. */
  readonly peutVoirAgence: boolean;
  /** La portée effectivement servie (celle que l'API a appliquée, sinon celle demandée). */
  readonly agence: boolean;
}

/**
 * TCK-2628 — la lecture des trois onglets de l'agent qui lisent `GET /api/dashboard/agent` (vue
 * d'ensemble, commissions, pipeline), sortie de `overview/agent/page.tsx`. TCK-1376 (P138.07) — les
 * capacités du profil actif, la lecture du layout ; une panne (`null`) vaut l'absence de la capacité.
 */
export async function lireLeTableauDeLAgent(
  scope: string | string[] | undefined,
  /** TCK-2791 — la vue d'ensemble seule la passe ; les onglets Commissions et Pipeline lisent le mois en cours. */
  periode: PeriodeDesRapports = 'current_month',
): Promise<TableauDeLAgent> {
  const capacites = await capacitesDuProfilActif();
  const peutVoirAgence = (capacites ?? []).includes(CAPACITE_AGENCE);
  const portee: AgentDashboardScope = porteeTransmise(scope) && peutVoirAgence ? 'agency' : 'mine';
  const payload = await fetchAgentDashboard({ scope: portee, ...(periode === 'last_month' ? { period: periode } : {}) });
  return { payload, peutVoirAgence, agence: (payload?.data.scope ?? portee) === 'agency' };
}
