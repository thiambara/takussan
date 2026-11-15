import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { getMeAction } from '@/app/actions/auth';
import { SuiviDesFavoris } from '@/components/favorites/SuiviDesFavoris';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.favorites');
  return { title: t('metaTitle') };
}

/**
 * TCK-2618 (décision 4 b) — la page des favoris du site public (`SuiviDesFavoris`), dans la coque de
 * `/app`, sur l'onglet « Biens ». L'onglet « Favoris » du client et le cœur de la barre publique mènent
 * ainsi au même contenu. Ce que la liste d'avant (`FavoritesList`) faisait, la page le fait : retirer,
 * « Biens proches », carte éteinte d'un bien retiré, états vide et erreur, note, pagination.
 */
export default async function FavoritesPage() {
  // Ensure auth (redirects inside the dashboard group if unauthenticated).
  await getMeAction();
  return (
    <Suspense>
      <SuiviDesFavoris coque="app" onglet="properties" />
    </Suspense>
  );
}
