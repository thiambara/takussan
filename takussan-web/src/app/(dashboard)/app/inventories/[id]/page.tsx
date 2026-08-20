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
        <h1 className="font-display text-2xl font-bold text-foreground">{t('notFound')}</h1>
        <p className="text-sm text-muted-foreground">{t('invalidId')}</p>
        <Link href="/app/inventories" className={buttonVariants({ variant: 'default' })}>
          {t('backToList')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">{t('title', { id: numericId })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Link href="/app/inventories" className={buttonVariants({ variant: 'outline' })}>
          {t('back')}
        </Link>
      </div>
      <InventoryDetail id={numericId} />
    </div>
  );
}
