import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchThresholdAlerts } from '@/lib/queries/alerts';
import { AlertList } from './AlertList';

/**
 * TCK-032 P3 — threshold alerts admin page.
 */
export default async function AlertsPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/overview');

  const alerts = await fetchThresholdAlerts();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Alertes de seuil</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Configurez les alertes déclenchées lorsque certains KPIs franchissent un seuil.
          Évaluées toutes les heures.
        </p>
      </div>
      <AlertList initialAlerts={alerts?.data ?? []} />
    </div>
  );
}
