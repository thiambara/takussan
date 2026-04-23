import { forbidden } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { PropertyForm } from '@/components/property-form';

/**
 * TCK-041 — page de création d'un bien.
 */

export const dynamic = 'force-dynamic';

export default async function Page() {
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-app-ink">Publier un bien</h1>
        <p className="mt-1 text-sm text-app-ink-muted">
          Remplissez les informations essentielles. Vous pourrez enrichir la
          fiche après publication.
        </p>
      </header>
      <PropertyForm mode="create" />
    </div>
  );
}
