'use client';

import { useTranslations } from 'next-intl';

import { PageHeader } from '@/components/console';
import { AdminCreditWallets } from '@/components/boost/admin/AdminCreditWallets';

/** TCK-633 lot F (ADR-0061 §1) — les portefeuilles de crédits des espaces. */
export default function SuperAdminCreditsPage() {
  const t = useTranslations('superAdmin.credits');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <AdminCreditWallets />
    </div>
  );
}
