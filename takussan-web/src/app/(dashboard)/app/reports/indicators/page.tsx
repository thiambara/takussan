import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { PageDesIndicateurs } from '@/components/rapports/vues/PageDesIndicateurs';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('indicateurs') };
}

/** TCK-2628 (décision 3) — « Indicateurs », hors des onglets. */
export default async function Page() {
  return <PageDesIndicateurs />;
}
