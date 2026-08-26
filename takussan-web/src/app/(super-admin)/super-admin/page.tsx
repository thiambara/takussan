import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.home');
  return { title: t('metaTitle') };
}

export default async function SuperAdminDashboardPage() {
  const t = await getTranslations('superAdmin.pages.home');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <SystemMetricsGrid />
    </div>
  );
}
