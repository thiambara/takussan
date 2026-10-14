'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminBoosts } from '@/components/boost/admin/AdminBoosts';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-633 lot F (ADR-0061 §5) — les boosts du parc. */
export default function SuperAdminBoostsPage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminBoosts />
    </div>
  );
}
