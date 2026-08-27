import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PropertiesDiscoveryPage } from '@/components/property/PropertiesDiscoveryPage';

import { PropertiesSkeleton } from './loading';
import { alternatesLangues } from '@/lib/alternates';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.properties');
  return {
    title: t('title'),
    description: t('description'),
    // hreflang — ADR-0026 §1. Le chemin est donné SANS langue : `alternatesLangues` les décline.
    alternates: alternatesLangues('/properties'),
  };
}

/**
 * Wave 3 — `/properties` discovery surface. Embeds the shared filter rail,
 * the list/map view toggle, and the « Sauvegarder la recherche » CTA.
 */
export default function Page() {
  return (
    // `fallback` n'était PAS passé (TCK-335, étape 6) : un `<Suspense>` sans repli ne montre
    // rien pendant la suspension. `PropertiesDiscoveryPage` lit `useSearchParams`, donc son
    // rendu SUSPEND — c'est exactement le moment que ce repli couvre. Il partage le squelette
    // de `loading.tsx`, qui couvre l'instant d'avant : la navigation.
    <Suspense fallback={<PropertiesSkeleton />}>
      <PropertiesDiscoveryPage />
    </Suspense>
  );
}
