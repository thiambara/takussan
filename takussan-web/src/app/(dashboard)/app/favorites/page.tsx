import { getMeAction } from '@/app/actions/auth';
import { FavoritesList } from '@/components/favorites/FavoritesList';

export const metadata = {
  title: 'Mes favoris',
};

/**
 * Dashboard page — lists the properties the current user favorited.
 * Wave 3 / TCK-047.
 */
export default async function FavoritesPage() {
  // Ensure auth (redirects inside the dashboard group if unauthenticated).
  await getMeAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-app-ink">Mes favoris</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Les biens que vous avez sauvegardés sont regroupés ici.
        </p>
      </div>
      <FavoritesList />
    </div>
  );
}
