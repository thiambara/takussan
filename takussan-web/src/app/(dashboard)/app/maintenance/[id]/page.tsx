import type { Metadata } from 'next';
import Link from 'next/link';

import { getMeAction } from '@/app/actions/auth';
import { MaintenanceDetail } from '@/components/maintenance';
import { buttonVariants } from '@/components/ui/button';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/console';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.maintenanceDetail');
  return { title: t('metaTitle') };
}

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

export default async function Page({ params }: PageProps) {
  const t = await getTranslations('dashboard.maintenanceDetail');
  await getMeAction();
  const { id } = await params;
  const numericId = Number(id);

  // TCK-442 — la validité de l'identifiant ET l'existence de la ressource sont tranchées par
  // `[id]/layout.tsx`, strictement au-dessus du `loading.tsx` de ce segment : un `notFound()`
  // écrit ici rendrait 200, avec l'écran introuvable affiché quand même. La décision n'a pas
  // changé de nature — un identifiant illisible reste un INTROUVABLE, jamais une panne — elle
  // a changé d'étage, et elle couvre désormais aussi le 404 de l'API.

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
