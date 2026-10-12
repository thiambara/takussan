'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminBoostCatalogue } from '@/components/boost/admin/AdminBoostCatalogue';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-633 lot F (ADR-0061 §4) — le catalogue des offres. */
export default function SuperAdminBoostCataloguePage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminBoostCatalogue />
    </div>
  );
}
