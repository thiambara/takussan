import { getTranslations } from 'next-intl/server';
import { ReportingShell } from '@/components/reporting/ReportingShell';
import { PageHeader } from '@/components/console';

export default async function Page() {
  const t = await getTranslations('superAdmin.pages.reports');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <ReportingShell />
    </div>
  );
}
