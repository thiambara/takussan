'use client';

import { useTranslations } from 'next-intl';
import { HealthDashboard } from '@/components/admin/super/system-health';

export default function SuperAdminHealthPage() {
  const t = useTranslations('superAdmin.pages.systemHealth');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </header>
      <HealthDashboard />
    </div>
  );
}
