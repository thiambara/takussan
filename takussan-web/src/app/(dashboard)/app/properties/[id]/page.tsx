import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { getMeAction } from '@/app/actions/auth';

export const metadata: Metadata = { title: 'Fiche bien' };
import { fetchTagsAction } from '@/app/actions/admin-tags';
import { getToken } from '@/lib/session';
import { fetchDashboardProperty } from '@/lib/queries/properties-server';
import { ApiError } from '@/lib/api';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyForm } from '@/components/property-form';
import { PropertyMediaPanel } from '@/components/property-dashboard/PropertyMediaPanel';
import { AddDocumentButton } from '@/components/documents/AddDocumentButton';
import { PropertyModerationBanner } from '@/components/property-form/PropertyModerationBanner';
import { formatCurrency } from '@/lib/format';
import type { PropertyDetail } from '@/types/property';
import type { ReactNode } from 'react';

/**
 * TCK-041 — page d'édition d'un bien existant.
 */

export const dynamic = 'force-dynamic';

type Params = Promise<{ id: string }>;

export default async function Page({ params }: { params: Params }) {
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const { id } = await params;
  const token = await getToken();
  if (!token) redirect('/app');

  let property;
  try {
    property = await fetchDashboardProperty(token, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) {
      redirect('/app');
    }
    throw e;
  }

  const tagsResult = await fetchTagsAction({ filters: { type: 'amenity' }, perPage: 200 });
  const tags = tagsResult.ok ? (tagsResult.data?.data ?? []) : [];

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
      {/* TCK-098 — show moderation status to the agent */}
      <PropertyModerationBanner property={property} />
      <PropertyOwnerSections property={property} />
      <PropertyForm mode="edit" property={property} tags={tags} />
      <PropertyMediaPanel propertyId={property.id} />
    </div>
  );
}

function PropertyOwnerSections({ property }: { property: PropertyDetail }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Adresse / localisation</h2>
        <p className="mt-2 text-sm text-stone-600">
          {property.location?.full ||
            [property.location?.street, property.location?.quarter, property.location?.city]
              .filter(Boolean)
              .join(', ') ||
            'Adresse à compléter'}
        </p>
        <p className="mt-2 text-xs text-stone-500">
          {property.location?.latitude && property.location?.longitude
            ? `${property.location.latitude}, ${property.location.longitude}`
            : 'Coordonnées GPS non renseignées'}
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Caractéristiques</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Metric label="Surface" value={property.area ? `${property.area} m²` : '—'} />
          <Metric label="Chambres" value={property.bedrooms ?? '—'} />
          <Metric label="Salles d’eau" value={property.bathrooms ?? '—'} />
          <Metric label="Étage" value={property.floor_number ?? '—'} />
        </dl>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Statistiques</h2>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <Metric label="Vues" value={property.views_count ?? 0} />
          <Metric label="Favoris" value={property.favorites_count ?? 0} />
          <Metric label="Avis" value={property.reviews_count ?? 0} />
          <Metric label="Note" value={property.average_rating ?? '—'} />
        </dl>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5 lg:col-span-2">
        <h2 className="text-sm font-semibold text-stone-900">Historique de prix</h2>
        {property.price_history?.length ? (
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {property.price_history.slice(0, 5).map((entry) => (
              <li key={entry.id} className="flex justify-between gap-3 py-2">
                <span className="text-stone-600">{entry.changed_at?.slice(0, 10) ?? 'Date inconnue'}</span>
                <span className="font-medium text-stone-900">
                  {formatCurrency(entry.old_price, 'fr', { currency: entry.currency })} →{' '}
                  {formatCurrency(entry.new_price, 'fr', { currency: entry.currency })}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-stone-500">Aucun changement de prix enregistré.</p>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-sm font-semibold text-stone-900">Légal / titre foncier</h2>
        <p className="mt-3 text-sm text-stone-600">
          {property.title_type_label ?? property.title_type ?? 'Type de titre à renseigner'}
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="font-medium text-stone-900">{value}</dd>
    </div>
  );
}
