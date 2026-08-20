import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.home');
  return { title: t('metaTitle') };
}

export default async function SuperAdminDashboardPage() {
  const t = await getTranslations('superAdmin.pages.home');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <SystemMetricsGrid />
    </div>
  );
}
