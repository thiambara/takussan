import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PropertiesDiscoveryPage } from '@/components/property/PropertiesDiscoveryPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.properties');
  return {
    title: t('title'),
    description: t('description'),
  };
}

/**
 * Wave 3 — `/properties` discovery surface. Embeds the shared filter rail,
 * the list/map view toggle, and the « Sauvegarder la recherche » CTA.
 */
export default function Page() {
  return (
    <Suspense>
      <PropertiesDiscoveryPage />
    </Suspense>
  );
}
