import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';

import { MaintenanceList } from '@/components/maintenance';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';
import { ServiceProviderBillsTable } from '@/components/payments/ServiceProviderBillsTable';
import { isServiceProvider } from '@/lib/roles';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.maintenance');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.maintenance');
  const user = await getMeAction();
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <MaintenanceList />
      {/* TCK-594 (ADR-0039 §8) — le prestataire suit ses factures et leur paiement. */}
      {isServiceProvider(user.roles) ? <ServiceProviderBillsTable mode="provider" /> : null}
    </div>
  );
}
