import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { CreateLeaseForm } from '@/components/leases/CreateLeaseForm';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.leaseNew');
  return { title: t('metaTitle') };
}

export default async function Page() {
  const t = await getTranslations('dashboard.pages.leaseNew');
  await getMeAction();
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CreateLeaseForm />
    </div>
  );
}
