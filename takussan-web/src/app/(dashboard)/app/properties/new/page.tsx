import { forbidden } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { PropertyForm } from '@/components/property-form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-app-ink">Publier un bien</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Remplissez les informations essentielles. Vous pourrez enrichir la
          fiche après publication.
        </p>
      </header>
      <PropertyForm mode="create" tags={tags} />
    </div>
  );
}
