'use client';

import { useTranslations } from 'next-intl';
import { HealthDashboard } from '@/components/admin/super/system-health';
import { PageHeader } from '@/components/console';

export default function SuperAdminHealthPage() {
  const t = useTranslations('superAdmin.pages.systemHealth');

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('subtitle')}
      />
      <HealthDashboard />
    </div>
  );
}
