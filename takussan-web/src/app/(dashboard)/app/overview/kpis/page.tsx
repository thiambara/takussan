import { getMeAction } from '@/app/actions/auth';
import { isAdmin } from '@/lib/roles';
import { redirect } from 'next/navigation';
import { fetchKpiConfigs, fetchKpiMetricsCatalog } from '@/lib/queries/kpis';
import { KpiConfigList } from './KpiConfigList';

/**
 * TCK-032 P3 — KPI customisation per agency.
 */
export default async function KpisPage() {
  const user = await getMeAction();
  if (!isAdmin(user.roles)) redirect('/app/overview');

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
