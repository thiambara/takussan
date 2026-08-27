'use client';

import { useTranslations } from 'next-intl';
import { FailedJobsConsole } from '@/components/admin/super/failed-jobs';
import { PageHeader } from '@/components/console';

export default function SuperAdminFailedJobsPage() {
  const t = useTranslations('superAdmin.pages.failedJobs');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <FailedJobsConsole />
    </div>
  );
}
