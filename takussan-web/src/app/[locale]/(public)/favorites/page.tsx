import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PublicFavoritesPage } from '@/components/favorites/PublicFavoritesPage';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta.favorites');
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default function Page() {
  return (
    <Suspense>
      <PublicFavoritesPage />
    </Suspense>
  );
}
