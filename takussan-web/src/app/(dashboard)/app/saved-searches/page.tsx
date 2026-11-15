import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getMeAction } from '@/app/actions/auth';
import { SuiviDesFavoris } from '@/components/favorites/SuiviDesFavoris';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.savedSearches');
  return { title: t('metaTitle') };
}

/**
 * TCK-2618 (décision 4 b) — la page des favoris du site public (`SuiviDesFavoris`), dans la coque de
 * `/app`, sur l'onglet « Recherches ». Ce que la liste d'avant (`SavedSearchesList`) faisait, chaque
 * ligne le fait (`gestion`) : relancer, régler l'alerte, supprimer avec le refus dit sur la ligne
 * (P210-03), résumé des critères (villes, équipements).
 */
export default async function SavedSearchesPage() {
  await getMeAction();
  return (
    <Suspense>
      <SuiviDesFavoris coque="app" onglet="searches" />
    </Suspense>
  );
}
