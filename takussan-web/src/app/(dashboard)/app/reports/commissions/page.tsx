import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletDesCommissions } from '@/components/rapports/ensemble/OngletDesCommissions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('commissions') };
}

interface Props {
  readonly searchParams?: Promise<{ readonly scope?: string | string[] }>;
}

/** TCK-2628 — l'onglet « Commissions » de l'agent, portée comprise. */
export default async function Page({ searchParams }: Props) {
  return <OngletDesCommissions scope={(await searchParams)?.scope} />;
}
