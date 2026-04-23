import { forbidden, notFound } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchDashboardProperty } from '@/lib/queries/properties';
import { ApiError } from '@/lib/api';
import { isAdmin, isAgent, isOwner } from '@/lib/roles';
import { PropertyForm } from '@/components/property-form';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';

/**
 * TCK-041 — page d'édition d'un bien existant.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const user = await getMeAction();
  if (!(isAgent(user.roles) || isAdmin(user.roles) || isOwner(user.roles))) {
    forbidden();
  }

  const { id } = await params;
  const token = await getToken();
  if (!token) forbidden();

  let property;
  try {
    property = await fetchDashboardProperty(token, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      forbidden();
    }
    throw e;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-app-ink-muted">
            Bien · {property.reference_number ?? `#${property.id}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-app-ink">{property.title}</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Modifiez les informations puis enregistrez pour mettre l&apos;annonce à jour.
          </p>
        </div>
        <AddDocumentButton
          documentableType="property"
          documentableId={property.id}
          displayLabel={property.title}
        />
      </header>
      <PropertyForm mode="edit" property={property} />
    </div>
  );
}
