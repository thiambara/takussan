import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletEquipe } from '@/components/rapports/vues/OngletEquipe';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('equipe') };
}

/** TCK-2628 — l'onglet « Équipe » (décision 2). */
export default async function Page() {
  const { user } = await lireLeContexteDesRapports();
  return typeof user.agency_id === 'number' ? <OngletEquipe agencyId={user.agency_id} /> : null;
}
