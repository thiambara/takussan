import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { getToken } from '@/lib/session';
import { resolveAgencyOrNull } from '@/lib/access/server-guards';
import { fetchKpiConfigs, fetchKpiMetricsCatalog } from '@/lib/queries/kpis';
import { KpiConfigList } from './KpiConfigList';

/**
 * TCK-032 P3 — KPI customisation per agency.
 */
export default async function KpisPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/overview');

  // Pro-only — bounce individual agencies back to dashboard. Super-admins
  // have no `agency_id` and are passed through.
  if (user.agency_id) {
    const token = await getToken();
    const agency = token ? await resolveAgencyOrNull(token, user.agency_id, 'overview/kpis', 'decision') : null;
    // FAIL-CLOSED : `!agency` redirige AUSSI. `fetchAgency` avale son erreur en `null`
    // (`.catch(() => null)`), donc `if (agency && …)` laissait passer une API en panne :
    // l'écran pro s'affichait pour une agence `individual` dès que la requête échouait.
    // Un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.
    if (!agency || agency.kind !== 'standard') redirect('/app');
  }

  const [configs, catalog] = await Promise.all([fetchKpiConfigs(), fetchKpiMetricsCatalog()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">KPIs personnalisés</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choisissez les indicateurs à mettre en avant sur le tableau de bord de votre agence.
        </p>
      </div>
      <KpiConfigList
        initialConfigs={configs?.data ?? []}
        catalog={catalog?.data ?? []}
      />
    </div>
  );
}
