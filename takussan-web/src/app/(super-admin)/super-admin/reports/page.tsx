import { getTranslations } from 'next-intl/server';
import { ReportingShell } from '@/components/reporting/ReportingShell';

export default async function Page() {
  const t = await getTranslations('superAdmin.pages.reports');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ReportingShell />
    </div>
  );
}
