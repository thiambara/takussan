import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { SystemMetricsGrid } from '@/components/admin/super/SystemMetricsGrid';
import { buttonVariants } from '@/components/ui/button';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('superAdmin.pages.system');
  return { title: t('metaTitle') };
}

export default async function SuperAdminSystemPage() {
  const t = await getTranslations('superAdmin.pages.system');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />

      <SystemMetricsGrid />

      <section className="rounded-xl bg-card p-6 ring-1 ring-border">
        <h2 className="text-base font-semibold text-foreground">{t('globalSettings.title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('globalSettings.body')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/super-admin/settings" className={buttonVariants()}>
            {t('globalSettings.openSettings')}
          </Link>
          <Link
            href="/super-admin/system/maintenance"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('globalSettings.maintenance')}
          </Link>
          <Link
            href="/super-admin/system/health"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('globalSettings.healthcheck')}
          </Link>
          <Link
            href="/super-admin/system/scheduler"
            className={buttonVariants({ variant: 'outline' })}
          >
            {t('globalSettings.scheduler')}
          </Link>
        </div>
      </section>
    </div>
  );
}
