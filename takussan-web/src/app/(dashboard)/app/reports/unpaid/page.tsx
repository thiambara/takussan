import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletImpayes } from '@/components/rapports/vues/OngletImpayes';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('impayes') };
}

/** TCK-2628 — l'onglet « Impayés » (décision 2, ADR-0096 § 5). */
export default async function Page() {
  const { user } = await lireLeContexteDesRapports();
  return <OngletImpayes agencyId={typeof user.agency_id === 'number' ? user.agency_id : undefined} />;
}
