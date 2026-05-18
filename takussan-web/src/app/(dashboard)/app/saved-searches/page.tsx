import { getMeAction } from '@/app/actions/auth';
import { SavedSearchesList } from '@/components/favorites/SavedSearchesList';

export const metadata = {
  title: 'Mes recherches sauvegardées',
};

/**
 * Dashboard page — lists the user's saved searches with a shortcut to
 * replay them on `/properties`. Wave 3 / TCK-047.
 */
export default async function SavedSearchesPage() {
  await getMeAction();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">
          Mes recherches sauvegardées
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relancez en un clic les filtres que vous utilisez le plus.
        </p>
      </div>
      <SavedSearchesList />
    </div>
  );
}
