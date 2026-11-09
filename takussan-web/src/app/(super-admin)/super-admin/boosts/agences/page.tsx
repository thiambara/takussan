'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminAgencySpotlights } from '@/components/boost/admin/AdminAgencySpotlights';
import { BoostsNav } from '@/components/boost/admin/BoostsNav';

/** TCK-2520 (ADR-0092) — la place « Mise en avant » de l'annuaire des agences, offerte par la plateforme. */
export default function SuperAdminAgencySpotlightsPage() {
  const t = useTranslations('superAdmin.boosts');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} actions={<BoostsNav />} />
      <AdminAgencySpotlights />
    </div>
  );
}
