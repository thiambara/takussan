'use client';

import { useTranslations } from 'next-intl';
import { PaymentsConsole } from '@/components/admin/super/payments';
import { PageHeader } from '@/components/console';

/** TCK-602 — la console « Paiements » : échecs, retards, et journal des webhooks rejouable. */
export default function SuperAdminPaymentsPage() {
  const t = useTranslations('superAdmin.pages.payments');

  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <PaymentsConsole />
    </div>
  );
}
