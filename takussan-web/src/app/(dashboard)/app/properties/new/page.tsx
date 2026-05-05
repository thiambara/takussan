import type { Metadata } from 'next';

import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Publier un bien' };
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyForm } from '@/components/property-form';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

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
