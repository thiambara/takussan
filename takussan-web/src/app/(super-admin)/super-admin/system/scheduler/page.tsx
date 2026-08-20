'use client';

import { useTranslations } from 'next-intl';
import { ScheduledTaskTable } from '@/components/admin/super/scheduler';

export default function SuperAdminSchedulerPage() {
  const t = useTranslations('superAdmin.pages.scheduler');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <ScheduledTaskTable />
    </div>
  );
}
