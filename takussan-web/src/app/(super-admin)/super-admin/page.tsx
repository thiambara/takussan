import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { ConsoleQueues } from '@/components/admin/super/ConsoleQueues';
import { ConsoleRecentActivity } from '@/components/admin/super/ConsoleRecentActivity';
import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.home');
  return { title: t('metaTitle') };
}

/**
 * TCK-360 — l'accueil de la console, inversé.
 *
 * L'ORDRE EST LE CONTENU : ce qui attend une action d'abord (les files), l'état de la plateforme
 * ensuite (les métriques), ce qui vient de se passer en bas (l'audit). La page précédente
 * commençait par huit nombres sans destination — la première chose qu'un super-admin y voyait
 * n'était pas ce qu'il avait à faire.
 */
export default async function SuperAdminDashboardPage() {
  const t = await getTranslations('superAdmin.pages.home');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <ConsoleQueues />
      <section aria-labelledby="super-admin-metrics" className="space-y-3">
        <h2 id="super-admin-metrics" className="font-display text-base font-semibold text-foreground">
          {t('metricsTitle')}
        </h2>
        <SystemMetricsGrid />
      </section>
      <ConsoleRecentActivity />
    </div>
  );
}
