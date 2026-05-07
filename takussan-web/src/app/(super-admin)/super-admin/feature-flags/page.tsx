'use client';

import { useQuery } from '@tanstack/react-query';
import { FeatureFlagTable } from '@/components/admin/super/feature-flags';
import { fetchAdminFeatureFlags } from '@/lib/queries/super-admin';
import type { AdminFeatureFlagsResponse } from '@/types/super-admin';
import type { ApiError } from '@/lib/api';

export default function SuperAdminFeatureFlagsPage() {
  const query = useQuery<AdminFeatureFlagsResponse, ApiError>({
    queryKey: ['super-admin', 'feature-flags'],
    queryFn: fetchAdminFeatureFlags,
    staleTime: 30_000,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-stone-900">Feature flags</h1>
        <p className="mt-1 text-sm text-stone-600">
          Contrôlez les rollouts globaux, par segment et par override de session.
        </p>
      </header>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-stone-200" />
      ) : query.isError ? (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-900 ring-1 ring-red-200">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : (
        <FeatureFlagTable flags={query.data?.data ?? []} />
      )}
    </div>
  );
}
