'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Home } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminAgencies, fetchAdminProperties } from '@/lib/queries/super-admin';
import { SuperAdminPropertiesFilters } from '@/components/admin/super/SuperAdminPropertiesFilters';
import { SuperAdminPropertiesTable } from '@/components/admin/super/SuperAdminPropertiesTable';
import { Pagination } from '@/components/super-admin/Pagination';
import type { AdminPropertiesResponse, AdminAgenciesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

/**
 * TCK-132 — `/super-admin/properties` cross-tenant catalog. The server-side
 * `(super-admin)` layout (TCK-145) gates access by role, so this client
 * component can assume `super_admin`. All query state lives in the URL so
 * filtered views are shareable; React Query manages the request lifecycle.
 */
export default function SuperAdminPropertiesPage() {
  const t = useTranslations('superAdmin.properties');
  const router = useRouter();
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

  const goToPage = (next: number) => {
    const next_params = new URLSearchParams(searchParams.toString());
    next_params.set('page', String(next));
    router.replace(`?${next_params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-foreground">Biens</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Catalogue cross-tenant — filtrer, trier et agir sur les biens de toutes les agences.
        </p>
      </header>

      <SuperAdminPropertiesFilters agencies={agencyOptions} />

      {propertiesQuery.isLoading ? (
        <div className="space-y-2" data-testid="properties-loading">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-md bg-muted"
              aria-hidden="true"
            />
          ))}
        </div>
      ) : propertiesQuery.isError ? (
        <ErrorState message={propertiesQuery.error?.displayMessage ?? t('error')} />
      ) : !propertiesQuery.data || propertiesQuery.data.data.length === 0 ? (
        <EmptyState
          data-testid="properties-empty"
          icon={<Home className="size-8" aria-hidden="true" />}
          title={t('empty_title')}
          description={t('empty_description')}
        />
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
            onChange={goToPage}
          />
        </>
      )}
    </div>
  );
}
