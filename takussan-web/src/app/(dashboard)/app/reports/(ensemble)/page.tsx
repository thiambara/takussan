import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { EnsembleAgence } from '@/components/rapports/ensemble/EnsembleAgence';
import { EnsembleAgent } from '@/components/rapports/ensemble/EnsembleAgent';
import { EnsembleBailleur } from '@/components/rapports/ensemble/EnsembleBailleur';
import { lireLeContexteDesRapports } from '@/lib/rapports/contexte-serveur';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('ensemble') };
}

interface Props {
  readonly searchParams?: Promise<{ readonly scope?: string | string[] }>;
}

/**
 * TCK-2628 — la vue d'ensemble, par persona : l'agence (admin, super-admin), l'agent (portée « Moi /
 * Agence »), le bailleur et l'hôte. La persona est celle de la coque (`lireLeContexteDesRapports`).
 */
export default async function Page({ searchParams }: Props) {
  const [{ persona }, parametres] = await Promise.all([lireLeContexteDesRapports(), searchParams ?? Promise.resolve({})]);
  switch (persona) {
    case 'agent':
      return <EnsembleAgent scope={(parametres as { scope?: string | string[] }).scope} />;
    case 'bailleur':
    case 'hote':
      return <EnsembleBailleur />;
    default:
      return <EnsembleAgence />;
  }
}
