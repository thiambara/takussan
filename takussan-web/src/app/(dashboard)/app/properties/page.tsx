import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus } from 'lucide-react';

export const metadata: Metadata = { title: 'Mes biens' };

import { getMeAction } from '@/app/actions/auth';
import { getToken } from '@/lib/session';
import { fetchDashboardProperties } from '@/lib/queries/properties-server';
import { assertCanReachAgentArea } from '@/lib/auth/guards';
import { PropertyList } from '@/components/property-dashboard/PropertyList';
import { PropertyListFilters } from '@/components/property-dashboard/PropertyListFilters';
import { PropertyPagination } from '@/components/property-dashboard/PropertyPagination';

/**
 * TCK-041 — dashboard agent, liste des biens.
 *
 * Auth gate : enforced by the `(dashboard)` layout (redirects to
 * `/auth/login`). Role gate : agents / agency_admin / super_admin / owner.
 * Scoping by agency is handled server-side by the `PropertyPolicy` +
 * controller query in takussan-api.
 */

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function asString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const user = await getMeAction();
  assertCanReachAgentArea(user.roles);

  const params = await searchParams;
  const token = await getToken();
  // `getMeAction` already redirects on missing token, so this is defensive.
  if (!token) redirect('/app');

  const page = Number.parseInt(asString(params.page) ?? '1', 10) || 1;
  const filters = {
    status: asString(params.status),
    type: asString(params.type),
    contract_type: asString(params.contract_type),
    search: asString(params.search),
    include_archived: asString(params.include_archived),
  };
  const sort = asString(params.sort);

  const response = await fetchDashboardProperties(token, {
    page,
    perPage: 20,
    filters,
    sort: sort && ['-created_at', 'created_at', 'price', '-price', 'views_count', '-views_count'].includes(sort)
      ? sort
      : '-created_at',
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-app-ink">Mes biens</h1>
          <p className="mt-1 text-sm text-app-ink-muted">
            Gérez votre portefeuille immobilier : publication, statut, visibilité.
          </p>
        </div>
        <Link
          href="/app/properties/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="size-4" aria-hidden="true" />
          Publier un bien
        </Link>
      </header>

      <PropertyListFilters />

      <PropertyList page={response} />

      <PropertyPagination meta={response.meta} />
    </div>
  );
}
