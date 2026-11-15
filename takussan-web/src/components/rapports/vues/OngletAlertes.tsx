import { AlertList } from '@/components/rapports/alertes/AlertList';
import { fetchThresholdAlerts } from '@/lib/queries/alerts';
import { fetchDashboardAgency } from '@/lib/queries/dashboard-agency';
import { apercusDuResume } from '@/lib/rapports/indicateurs';

/**
 * TCK-2628 — l'onglet « Alertes » : les alertes de seuil (TCK-032 P3), sorties de `overview/alerts/page.tsx`.
 * TCK-284 — pas de restriction `kind` : l'hôte les garde (décision 1 a).
 * TCK-2629 (AC-F3) — le résumé de l'agence donne la valeur actuelle de chaque métrique, que « Nouvelle alerte »
 * dit sous la métrique choisie. Une lecture en échec n'empêche pas l'onglet : la ligne n'est simplement pas dite.
 */
export async function OngletAlertes() {
  const [alerts, resume] = await Promise.all([fetchThresholdAlerts(), fetchDashboardAgency().catch(() => null)]);
  return <AlertList initialAlerts={alerts?.data ?? []} apercus={resume ? apercusDuResume(resume.data) : undefined} />;
}
