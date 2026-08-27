'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Home } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/feedback';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchAdminProperties } from '@/lib/queries/super-admin';
import { SuperAdminPropertiesFilters } from '@/components/admin/super/SuperAdminPropertiesFilters';
import { SuperAdminPropertiesTable } from '@/components/admin/super/SuperAdminPropertiesTable';
import { Pagination } from '@/components/console';
import type { AdminPropertiesResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';
import { useMessageErreurApi } from '@/hooks/useMessageErreurApi';
import { PageHeader } from '@/components/console';

/**
 * TCK-132 — `/super-admin/properties` cross-tenant catalog. The server-side
 * `(super-admin)` layout (TCK-145) gates access by role, so this client
 * component can assume `super_admin`. All query state lives in the URL so
 * filtered views are shareable; React Query manages the request lifecycle.
 */
export default function SuperAdminPropertiesPage() {
  const t = useTranslations('superAdmin.properties');
  const tPage = useTranslations('superAdmin.pages.properties');
  const messageErreur = useMessageErreurApi();
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

  // TCK-363 — la requête `fetchAdminAgencies({ perPage: 50 })` qui vivait ici est SUPPRIMÉE :
  // elle partait au montage de la page, que le filtre d'agence soit utilisé ou non, et rendait
  // une liste tronquée en silence. `AgencyCombobox` charge à la demande et cherche au serveur.

  const goToPage = (next: number) => {
    const next_params = new URLSearchParams(searchParams.toString());
    next_params.set('page', String(next));
    router.replace(`?${next_params.toString()}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage('title')}
        description={tPage('subtitle')}
      />

      <SuperAdminPropertiesFilters
        total={propertiesQuery.data?.meta.total}
        busy={propertiesQuery.isFetching}
      />

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
        <ErrorState message={messageErreur(propertiesQuery.error, t('error'))} />
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
