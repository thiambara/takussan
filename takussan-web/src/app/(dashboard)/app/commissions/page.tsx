import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { CommissionsLedger } from '@/components/commissions/CommissionsLedger';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('commissions');
  return { title: t('metaTitle') };
}

/** TCK-595 (ADR-0049 §3) — le relevé des commissions, par bail. */
export default async function Page() {
  const t = await getTranslations('commissions');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CommissionsLedger />
    </div>
  );
}
