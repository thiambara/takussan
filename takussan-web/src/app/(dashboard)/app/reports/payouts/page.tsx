import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletReversements } from '@/components/rapports/vues/OngletReversements';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('reversements') };
}

/** TCK-2628 — l'onglet « Reversements » du bailleur et de l'hôte. */
export default async function Page() {
  return <OngletReversements />;
}
