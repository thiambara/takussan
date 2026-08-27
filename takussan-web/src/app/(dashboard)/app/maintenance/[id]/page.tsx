import Link from 'next/link';

import { getMeAction } from '@/app/actions/auth';
import { MaintenanceDetail } from '@/components/maintenance';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const t = await getTranslations('dashboard.maintenanceDetail');
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('notFound')} description={t('invalidId')} />
        <Link href="/app/maintenance" className={buttonVariants({ variant: 'default' })}>
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t('title', { id: numericId })} description={t('subtitle')} />
        <Link href="/app/maintenance" className={buttonVariants({ variant: 'outline' })}>
          {t('back')}
        </Link>
      </div>
      <MaintenanceDetail id={numericId} />
    </div>
  );
}
