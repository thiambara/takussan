import { getTranslations } from 'next-intl/server';

import { KpiConfigList } from '@/components/rapports/indicateurs/KpiConfigList';
import { fetchKpiConfigs, fetchKpiMetricsCatalog } from '@/lib/queries/kpis';

/**
 * TCK-2628 (décision 3) — « Indicateurs » : la personnalisation des chiffres de l'agence (TCK-032 P3),
 * sortie de `overview/kpis/page.tsx`, sous `/app/reports/indicators`. Pas un onglet : on y arrive depuis
 * la vue d'ensemble, en attendant le réglage sur la page (TCK-2629). TCK-284 — pas de restriction `kind`.
 */
export async function PageDesIndicateurs() {
  const [t, configs, catalog] = await Promise.all([
    getTranslations('dashboard.pages.kpis'),
    fetchKpiConfigs(),
    fetchKpiMetricsCatalog(),
  ]);
  return (
    <section aria-labelledby="indicateurs-titre" className="space-y-4">
      <div>
        <h2 id="indicateurs-titre" className="text-base font-semibold text-foreground">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-pretty text-muted-foreground">{t('subtitleFull')}</p>
      </div>
      <KpiConfigList initialConfigs={configs?.data ?? []} catalog={catalog?.data ?? []} />
    </section>
  );
}
