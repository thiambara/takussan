import { AlertList } from '@/components/rapports/alertes/AlertList';
import { fetchThresholdAlerts } from '@/lib/queries/alerts';

/**
 * TCK-2628 — l'onglet « Alertes » : les alertes de seuil (TCK-032 P3), sorties de `overview/alerts/page.tsx`.
 * TCK-284 — pas de restriction `kind` : l'hôte les garde (décision 1 a).
 */
export async function OngletAlertes() {
  const alerts = await fetchThresholdAlerts();
  return <AlertList initialAlerts={alerts?.data ?? []} />;
}
