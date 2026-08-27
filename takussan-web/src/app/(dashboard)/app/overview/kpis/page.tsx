import type { Metadata } from 'next';
import { fetchKpiConfigs, fetchKpiMetricsCatalog } from '@/lib/queries/kpis';
import { KpiConfigList } from './KpiConfigList';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.kpis');
  return { title: t('metaTitle') };
}

/**
 * TCK-032 P3 — KPI customisation per agency.
 *
 * TCK-284 — **pas de restriction `kind`.** Cette page a porté un
 * `redirect('/app')` sur les agences `individual` du 2026-05-12 au
 * 2026-08-15, introduit par un commit intitulé « gate standard-only
 * features » sans qu'aucun ticket ni aucune spec ne le demande :
 * `docs/features.md` §1.12 donne une liste FERMÉE des restrictions d'une
 * agence `individual`, les KPI n'y sont pas, et la clause résiduelle les
 * rend explicitement disponibles. Le back ne l'a d'ailleurs jamais appliquée
 * (`KpiConfigController` ne regarde pas le `kind`) : la restriction n'a
 * jamais été un comportement, seulement un écran refusé.
 */
export default async function KpisPage() {
  const t = await getTranslations('dashboard.pages.kpis');
  // TCK-426 — le refus de rôle est REMONTÉ dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la vue interdite.

  const [configs, catalog] = await Promise.all([fetchKpiConfigs(), fetchKpiMetricsCatalog()]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitleFull')} />
      <KpiConfigList
        initialConfigs={configs?.data ?? []}
        catalog={catalog?.data ?? []}
      />
    </div>
  );
}
