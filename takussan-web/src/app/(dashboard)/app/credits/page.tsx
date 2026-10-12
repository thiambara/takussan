import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageHeader } from '@/components/console';
import { CreditsPanel } from '@/components/boost/CreditsPanel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('credits');
  return { title: t('metaTitle') };
}

/** TCK-633 lot F (ADR-0061 §1) — le portefeuille de crédits de l'espace actif. L'API tranche l'accès (403). */
export default async function Page() {
  const t = await getTranslations('credits');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('subtitle')} />
      <CreditsPanel />
    </div>
  );
}
