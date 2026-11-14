import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletExports } from '@/components/rapports/vues/OngletExports';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('exports') };
}

/** TCK-2628 — l'onglet « Exports ». */
export default async function Page() {
  const { user } = await lireLeContexteDesRapports();
  return <OngletExports user={user} />;
}
