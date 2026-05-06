import Image from 'next/image';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/api';
import type { PropertyListItem } from '@/types/property';
import {
  CONTRACT_TYPE_LABELS,
  PROPERTY_STATUS_LABELS,
  PROPERTY_TYPE_LABELS,
  PROPERTY_VISIBILITY_LABELS,
} from '@/components/property-form/options';

import { PropertyRowActions } from './PropertyRowActions';

/**
 * Table-style list of properties for the dashboard. Server-rendered so the
 * first paint is instant; row actions live in a client island.
 */

interface PropertyListProps {
  readonly page: PaginatedResponse<PropertyListItem>;
}

export function PropertyList({ page }: PropertyListProps) {
  const { data: properties, meta } = page;

  if (!properties || properties.length === 0) {
    return <EmptyState />;
  }

  return (
    <div className="space-y-4">
      <div className="hidden overflow-hidden rounded-xl bg-app-surface-1 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-app-surface-2/50 text-left text-xs uppercase tracking-wide text-app-ink-muted">
              <th className="px-4 py-3 font-semibold">Bien</th>
              <th className="px-4 py-3 font-semibold">Contrat</th>
              <th className="px-4 py-3 font-semibold">Prix</th>
              <th className="px-4 py-3 font-semibold">Stats</th>
              <th className="px-4 py-3 font-semibold">Statut</th>
              <th className="px-4 py-3 font-semibold">Visibilité</th>
              <th className="px-4 py-3 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-app-surface-2">
            {properties.map((property) => (
              <tr key={property.id} className="align-middle">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <PropertyThumbnail property={property} />
                    <div className="min-w-0">
                      <Link
                        href={`/app/properties/${property.id}`}
                        className="block truncate text-sm font-semibold text-app-ink hover:text-app-topbar"
                      >
                        {property.title}
                      </Link>
                      <p className="text-xs text-app-ink-muted">
                        {PROPERTY_TYPE_LABELS[property.type] ?? property.type}
                        {property.location?.city ? ` · ${property.location.city}` : ''}
                        {property.reference_number ? ` · ${property.reference_number}` : ''}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-app-ink-muted">
                  {property.contract_type
                    ? CONTRACT_TYPE_LABELS[property.contract_type]
                    : '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-app-ink">
                  {typeof property.price === 'number'
                    ? formatCurrency(property.price, 'fr', { currency: property.currency ?? 'XOF' })
                    : '—'}
                </td>
                <td className="px-4 py-3 text-xs text-app-ink-muted">
                  {property.views_count ?? 0} vues · {property.favorites_count ?? 0} favoris
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={property.status} />
                </td>
                <td className="px-4 py-3">
                  <VisibilityBadge visibility={property.visibility} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end">
                    <PropertyRowActions property={property} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="space-y-3 md:hidden">
        {properties.map((property) => (
          <li key={property.id} className="rounded-xl bg-app-surface-1 p-4">
            <div className="flex items-start gap-3">
              <PropertyThumbnail property={property} />
              <div className="min-w-0 flex-1">
                <Link
                  href={`/app/properties/${property.id}`}
                  className="block truncate text-sm font-semibold text-app-ink"
                >
                  {property.title}
                </Link>
                <p className="text-xs text-app-ink-muted">
                  {PROPERTY_TYPE_LABELS[property.type] ?? property.type}
                  {property.location?.city ? ` · ${property.location.city}` : ''}
                </p>
                <p className="mt-1 text-sm font-semibold text-app-ink">
                  {typeof property.price === 'number'
                    ? formatCurrency(property.price, 'fr', { currency: property.currency ?? 'XOF' })
                    : '—'}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusBadge status={property.status} />
              <VisibilityBadge visibility={property.visibility} />
            </div>
            <div className="mt-3 flex justify-end">
              <PropertyRowActions property={property} />
            </div>
          </li>
        ))}
      </ul>

      <p className="text-xs text-app-ink-muted">
        {meta.total} bien{meta.total > 1 ? 's' : ''} — page {meta.current_page} sur{' '}
        {meta.last_page}
      </p>
    </div>
  );
}

function PropertyThumbnail({ property }: { property: PropertyListItem }) {
  if (property.main_photo_url) {
    return (
      <span className="relative block aspect-square size-14 shrink-0 overflow-hidden rounded-lg bg-app-surface-2">
        <Image
          src={property.main_photo_url}
          alt=""
          fill
          sizes="56px"
          className="object-cover"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="block size-14 shrink-0 rounded-lg bg-app-surface-2"
    />
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const key = (status ?? 'available') as keyof typeof PROPERTY_STATUS_LABELS;
  const label = PROPERTY_STATUS_LABELS[key] ?? status ?? '—';
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-app-surface-3 bg-app-surface-2 text-app-ink',
        status === 'sold' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
        status === 'rented' && 'border-blue-200 bg-blue-50 text-blue-700',
        status === 'unavailable' && 'border-red-200 bg-red-50 text-red-700',
      )}
    >
      {label}
    </Badge>
  );
}

function VisibilityBadge({ visibility }: { visibility: string | null }) {
  const key = (visibility ?? 'private') as keyof typeof PROPERTY_VISIBILITY_LABELS;
  const label = PROPERTY_VISIBILITY_LABELS[key] ?? visibility ?? '—';
  return (
    <Badge
      variant="outline"
      className={cn(
        'border-app-surface-3 bg-app-surface-2 text-app-ink',
        visibility === 'public' && 'border-primary/30 bg-primary/5 text-primary',
      )}
    >
      {label}
    </Badge>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl bg-app-surface-1 px-6 py-16 text-center">
      <div className="rounded-full bg-app-surface-2 p-4 text-app-accent">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="size-8"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path d="M3 12l9-8 9 8v8a2 2 0 01-2 2h-4v-6H10v6H5a2 2 0 01-2-2v-8z" />
        </svg>
      </div>
      <p className="text-lg font-semibold text-app-ink">Aucun bien dans votre portefeuille</p>
      <p className="max-w-md text-sm text-app-ink-muted">
        Créez votre première annonce pour la diffuser auprès des locataires et
        acheteurs Takussan.
      </p>
      <Link
        href="/app/properties/new"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        Publier un bien
      </Link>
    </div>
  );
}
