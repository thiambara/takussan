import type { Metadata } from 'next';
import { getMeAction } from '@/app/actions/auth';
import { FavoritesList } from '@/components/favorites/FavoritesList';
import { getTranslations } from 'next-intl/server';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('dashboard.pages.favorites');
  return { title: t('metaTitle') };
}

/**
 * Dashboard page — lists the properties the current user favorited.
 * Wave 3 / TCK-047.
 */
export default async function FavoritesPage() {
  const t = await getTranslations('dashboard.pages.favorites');
  // Ensure auth (redirects inside the dashboard group if unauthenticated).
  await getMeAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
      </div>
      <FavoritesList />
    </div>
  );
}
