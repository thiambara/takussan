import type { Metadata } from 'next';
import Link from 'next/link';

import { getMeAction } from '@/app/actions/auth';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.inventoryDetail');
  return { title: t('metaTitle') };
}
import { InventoryDetail } from '@/components/inventory';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const t = await getTranslations('dashboard.inventoryDetail');
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('notFound')} description={t('invalidId')} />
        <Link href="/app/inventories" className={buttonVariants({ variant: 'default' })}>
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <PageHeader title={t('title', { id: numericId })} description={t('subtitle')} />
        <Link href="/app/inventories" className={buttonVariants({ variant: 'outline' })}>
          {t('back')}
        </Link>
      </div>
      <InventoryDetail id={numericId} />
    </div>
  );
}
