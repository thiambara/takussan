'use client';

import { useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminAgencies, fetchAdminProperties } from '@/lib/queries/super-admin';
import { SuperAdminPropertiesFilters } from '@/components/admin/super/SuperAdminPropertiesFilters';
import { SuperAdminPropertiesTable } from '@/components/admin/super/SuperAdminPropertiesTable';
import type { AdminPropertiesResponse, AdminAgenciesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

/**
 * TCK-132 — `/super-admin/properties` cross-tenant catalog. The server-side
 * `(super-admin)` layout (TCK-145) gates access by role, so this client
 * component can assume `super_admin`. All query state lives in the URL so
 * filtered views are shareable; React Query manages the request lifecycle.
 */
export default function SuperAdminPropertiesPage() {
  const searchParams = useSearchParams();

  const params = useMemo(
    () => ({
      search: searchParams.get('filter[search]') ?? undefined,
      status: searchParams.get('filter[status]') ?? undefined,
      type: searchParams.get('filter[type]') ?? undefined,
      visibility: searchParams.get('filter[visibility]') ?? undefined,
      agencyId: searchParams.get('filter[agency_id]')
        ? Number(searchParams.get('filter[agency_id]'))
        : undefined,
      sort: searchParams.get('sort') ?? '-created_at',
      page: Number.parseInt(searchParams.get('page') ?? '1', 10) || 1,
      perPage: 20,
    }),
    [searchParams],
  );

  const propertiesQuery = useQuery<AdminPropertiesResponse, ApiError>({
    queryKey: ['super-admin', 'properties', params],
    queryFn: () => fetchAdminProperties(params),
    staleTime: 15_000,
  });

  const agenciesQuery = useQuery<AdminAgenciesResponse, ApiError>({
    queryKey: ['super-admin', 'agencies', 'all-for-filter'],
    queryFn: () => fetchAdminAgencies({ perPage: 50 }),
    staleTime: 5 * 60_000,
  });

  const agencyOptions = useMemo(
    () => (agenciesQuery.data?.data ?? []).map((a) => ({ id: a.id, name: a.name })),
    [agenciesQuery.data],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Biens</h1>
        <p className="mt-1 text-sm text-stone-600">
          Catalogue cross-tenant — filtrer, trier et agir sur les biens de toutes les agences.
        </p>
      </header>

      <SuperAdminPropertiesFilters agencies={agencyOptions} />

      {propertiesQuery.isLoading ? (
        <div className="space-y-2" data-testid="properties-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-12 animate-pulse rounded-md bg-stone-200" aria-hidden="true" />
          ))}
        </div>
      ) : propertiesQuery.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900" role="alert">
          Erreur de chargement. {propertiesQuery.error?.displayMessage}
        </div>
      ) : !propertiesQuery.data || propertiesQuery.data.data.length === 0 ? (
        <p
          className="rounded-xl bg-white p-6 text-center text-sm text-stone-500 ring-1 ring-stone-200"
          data-testid="properties-empty"
        >
          Aucun bien ne correspond aux filtres courants.
        </p>
      ) : (
        <>
          <SuperAdminPropertiesTable
            rows={propertiesQuery.data.data}
            total={propertiesQuery.data.meta.total}
            onChange={() => propertiesQuery.refetch()}
          />
          <Pagination
            page={propertiesQuery.data.meta.current_page}
            lastPage={propertiesQuery.data.meta.last_page}
          />
        </>
      )}
    </div>
  );
}

function Pagination({ page, lastPage }: { page: number; lastPage: number }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  if (lastPage <= 1) return null;

  const goTo = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(next));
    router.replace(`?${params.toString()}`);
  };

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between text-sm text-stone-600"
    >
      <button
        type="button"
        onClick={() => goTo(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="rounded-md border border-stone-300 bg-white px-3 py-1 disabled:opacity-50"
      >
        Précédent
      </button>
      <span>
        Page {page} sur {lastPage}
      </span>
      <button
        type="button"
        onClick={() => goTo(Math.min(lastPage, page + 1))}
        disabled={page >= lastPage}
        className="rounded-md border border-stone-300 bg-white px-3 py-1 disabled:opacity-50"
      >
        Suivant
      </button>
    </nav>
  );
}
