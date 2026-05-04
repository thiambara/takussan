import { Suspense } from 'react';
import { PublicFavoritesPage } from '@/components/favorites/PublicFavoritesPage';

export const metadata = {
  title: 'Mes favoris — Takussan',
  description:
    'Retrouvez tous les biens que vous avez sauvegardés. Synchronisés sur cet appareil même sans compte.',
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <Suspense>
      <PublicFavoritesPage />
    </Suspense>
  );
}
