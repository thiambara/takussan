import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletAlertes } from '@/components/rapports/vues/OngletAlertes';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('alertes') };
}

/** TCK-2628 — l'onglet « Alertes ». */
export default async function Page() {
  return <OngletAlertes />;
}
