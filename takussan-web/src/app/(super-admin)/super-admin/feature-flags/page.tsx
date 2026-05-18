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
        <h1 className="font-display text-2xl font-bold text-foreground">Feature flags</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contrôlez les rollouts globaux, par segment et par override de session.
        </p>
      </header>

      {query.isLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      ) : query.isError ? (
        <div className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive ring-1 ring-destructive/20">
          Erreur de chargement. {query.error.displayMessage}
        </div>
      ) : (
        <FeatureFlagTable flags={query.data?.data ?? []} />
      )}
    </div>
  );
}
