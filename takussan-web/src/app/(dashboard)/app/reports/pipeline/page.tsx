import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

import { OngletDuPipeline } from '@/components/rapports/ensemble/OngletDuPipeline';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('rapports.meta');
  return { title: t('pipeline') };
}

interface Props {
  readonly searchParams?: Promise<{ readonly scope?: string | string[] }>;
}

/** TCK-2628 — l'onglet « Pipeline » de l'agent, portée comprise. */
export default async function Page({ searchParams }: Props) {
  return <OngletDuPipeline scope={(await searchParams)?.scope} />;
}
