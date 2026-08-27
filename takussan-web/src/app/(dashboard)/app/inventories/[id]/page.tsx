import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

import { InventoryDetail } from '@/components/inventory';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.inventoryDetail');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const t = await getTranslations('dashboard.inventoryDetail');
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  // Identifiant illisible : introuvable, et non panne. L'écran local qui rendait ici un
  // titre + un lien de retour est remplacé par `app/not-found.tsx`, qui dit la même chose
  // en UN endroit et depuis le shell du tableau de bord.
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

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
