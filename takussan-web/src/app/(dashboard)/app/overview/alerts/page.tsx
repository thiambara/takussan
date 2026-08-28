import type { Metadata } from 'next';
import { fetchThresholdAlerts } from '@/lib/queries/alerts';
import { AlertList } from './AlertList';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.alerts');
  return { title: t('metaTitle') };
}

/**
 * TCK-032 P3 — threshold alerts admin page.
 *
 * TCK-284 — **pas de restriction `kind`**, pour la même raison que
 * `overview/kpis/page.tsx` : les alertes de seuil ne figurent dans aucune des
 * deux listes de restrictions des agences `individual` (`docs/features.md`
 * §1.12, `docs/models-spec.md`), et `ThresholdAlertController` ne les a
 * jamais restreintes côté API.
 */
export default async function AlertsPage() {
  const t = await getTranslations('dashboard.pages.alerts');
  // TCK-426 — le refus de rôle est REMONTÉ dans le `layout.tsx` de ce segment : ici, sous le
  // `loading.tsx`, son `redirect()` rendait 200 + le squelette de la vue interdite.

  const alerts = await fetchThresholdAlerts();

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitleFull')} />
      <AlertList initialAlerts={alerts?.data ?? []} />
    </div>
  );
}
