'use client';

import { useTranslations } from 'next-intl';
import { ScheduledTaskTable } from '@/components/admin/super/scheduler';
import { PageHeader } from '@/components/console';

export default function SuperAdminSchedulerPage() {
  const t = useTranslations('superAdmin.pages.scheduler');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <ScheduledTaskTable />
    </div>
  );
}
