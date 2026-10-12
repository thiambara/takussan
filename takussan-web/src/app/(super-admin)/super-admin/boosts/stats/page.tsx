'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminBoostStats } from '@/components/boost/admin/AdminBoostStats';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-633 lot F (ADR-0061 §10) — impressions, clics, taux de clic. */
export default function SuperAdminBoostStatsPage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminBoostStats />
    </div>
  );
}
