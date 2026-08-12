import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { getToken } from '@/lib/session';
import { fetchAgency } from '@/lib/queries/agencies';
import { fetchThresholdAlerts } from '@/lib/queries/alerts';
import { AlertList } from './AlertList';

/**
 * TCK-032 P3 — threshold alerts admin page.
 */
export default async function AlertsPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/overview');

  // Pro-only — bounce individual agencies back to dashboard. Super-admins
  // have no `agency_id` and are passed through.
  if (user.agency_id) {
    const token = await getToken();
    const agency = token ? await fetchAgency(token, user.agency_id).catch(() => null) : null;
    // FAIL-CLOSED : `!agency` redirige AUSSI. `fetchAgency` avale son erreur en `null`
    // (`.catch(() => null)`), donc `if (agency && …)` laissait passer une API en panne :
    // l'écran pro s'affichait pour une agence `individual` dès que la requête échouait.
    // Un écran réservé se refuse quand on ne SAIT PAS, pas seulement quand on sait que non.
    if (!agency || agency.kind !== 'standard') redirect('/app');
  }

  const alerts = await fetchThresholdAlerts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Alertes de seuil</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Configurez les alertes déclenchées lorsque certains KPIs franchissent un seuil.
          Évaluées toutes les heures.
        </p>
      </div>
      <AlertList initialAlerts={alerts?.data ?? []} />
    </div>
  );
}
