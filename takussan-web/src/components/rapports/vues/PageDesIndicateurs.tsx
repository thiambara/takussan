import { getTranslations } from 'next-intl/server';

import { ReglageEnPage } from '@/components/rapports/indicateurs/ReglageDesChiffres';
import { fetchKpiConfigs, fetchKpiMetricsCatalog } from '@/lib/queries/kpis';

/**
 * TCK-2628 (décision 3) — « Indicateurs », sous `/app/reports/indicators` (cible de l'ancienne
 * `/app/overview/kpis`). TCK-284 — pas de restriction `kind`.
 *
 * TCK-2629 — le MÊME réglage que « Personnaliser » de la vue d'ensemble (ordre, masquage, ajout,
 * suppression), posé sur la page : une interface, deux entrées.
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
      <ReglageEnPage configs={configs?.data ?? []} catalog={catalog?.data ?? []} />
    </section>
  );
}
